const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 5000
const apiRouter = express.Router()

app.use(cors())
app.use(express.json())

console.log('DATABASE_URL:', process.env.DATABASE_URL)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// ---------- helpers ----------
function validateProductInput(req, res, next) {
  const { part_number, description, category, status = 'Active' } = req.body
  if (!part_number || !description || !category) {
    return res.status(400).json({ error: 'Part Number, Product Description, and Category are required.' })
  }
  if (!['Active', 'Inactive'].includes(status)) {
    return res.status(400).json({ error: 'Product status must be Active or Inactive.' })
  }
  next()
}

async function ensureProductStatusColumn(client) {
  await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active'`)
}

async function ensureStockStatusTypeConstraint(client) {
  await client.query(`ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_stock_status_type_check`)
  await client.query(`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_stock_status_type_check CHECK (stock_status_type IN ('Available','Reserved','Pending PO','Modify','Sold','Showroom Unit','Warranty Replacement','Returned Stock','Damaged Stock'))`)
}

// ---------- routes ----------
apiRouter.get('/', (req, res) => {
  res.json({ message: 'Datacom Inventory API is running' })
})

// ========== USER AUTH ==========
// Login
apiRouter.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' })
  }

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND password = $2',
        [username, password]
      )
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password.' })
      }
      const user = result.rows[0]
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        allowedPages: user.allowed_pages
      })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (POST /login):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Sign Up (self-service)
apiRouter.post('/signup', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' })
  }

  const role = 'sales'
  const allowed_pages = ['inventory-view']

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `INSERT INTO users (username, password, role, allowed_pages) VALUES ($1,$2,$3,$4) RETURNING id, username, role, allowed_pages`,
        [username, password, role, allowed_pages]
      )
      res.json({ message: 'Account created successfully. You can now log in.', user: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists. Please choose another.' })
    console.error('DB error (POST /signup):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Forgot Password
apiRouter.post('/forgot-password', async (req, res) => {
  const { username, newPassword } = req.body
  if (!username || !newPassword) {
    return res.status(400).json({ error: 'Username and new password required.' })
  }

  try {
    const client = await pool.connect()
    try {
      const check = await client.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username])
      if (check.rows.length === 0) return res.status(404).json({ error: 'Username not found.' })
      await client.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, check.rows[0].id])
      res.json({ message: 'Password reset successfully.' })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (POST /forgot-password):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== USER MANAGEMENT (admin) ==========
// Get all users
apiRouter.get('/users', async (req, res) => {
  try {
    const client = await pool.connect()
    try {
      const result = await client.query('SELECT id, username, role, allowed_pages, created_at FROM users ORDER BY id')
      res.json(result.rows)
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (GET /users):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Create user (admin)
apiRouter.post('/users', async (req, res) => {
  const { username, password, role = 'sales', allowed_pages } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' })
  }

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `INSERT INTO users (username, password, role, allowed_pages) VALUES ($1,$2,$3,$4) RETURNING id, username, role, allowed_pages`,
        [username, password, role, allowed_pages || ['inventory-view']]
      )
      res.json({ message: 'User created successfully', user: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists.' })
    console.error('DB error (POST /users):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Delete user
apiRouter.delete('/users/:id', async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' })

  try {
    const client = await pool.connect()
    try {
      const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING *', [userId])
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' })
      res.json({ message: 'User deleted successfully', user: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (DELETE /users):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== PRODUCTS ==========
// GET products
apiRouter.get('/products', async (req, res) => {
  try {
    const client = await pool.connect()
    try {
      await ensureProductStatusColumn(client)
      const result = await client.query(`SELECT id, part_number, description AS description, category, COALESCE(status, 'Active') AS status, created_at FROM products ORDER BY id DESC`)
      res.json(result.rows)
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (GET /products):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST product
apiRouter.post('/products', validateProductInput, async (req, res) => {
  const { part_number, description, category, status = 'Active' } = req.body
  try {
    const client = await pool.connect()
    try {
      await ensureProductStatusColumn(client)
      const result = await client.query(
        `INSERT INTO products (part_number, description, category, status) VALUES ($1,$2,$3,$4) ON CONFLICT (part_number) DO UPDATE SET description = EXCLUDED.description, category = EXCLUDED.category, status = EXCLUDED.status RETURNING *`,
        [part_number, description, category, status]
      )
      res.json({ message: 'Product saved successfully', product: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (POST /products):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// PUT product
apiRouter.put('/products/:id', validateProductInput, async (req, res) => {
  const productId = Number(req.params.id)
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' })

  const { part_number, description, category, status = 'Active' } = req.body
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await ensureProductStatusColumn(client)
      await client.query(`ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_part_number_fkey`)
      await client.query(`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_part_number_fkey FOREIGN KEY (part_number) REFERENCES products(part_number) ON UPDATE CASCADE`)

      const result = await client.query(`UPDATE products SET part_number = $1, description = $2, category = $3, status = $4 WHERE id = $5 RETURNING *`, [part_number, description, category, status, productId])
      if (result.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Product not found' })
      }
      await client.query('COMMIT')
      res.json({ message: 'Product updated successfully', product: result.rows[0] })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (PUT /products):', err.message)
    if (err.code === '23505') return res.status(409).json({ error: 'Part number already exists.' })
    res.status(500).json({ error: err.message })
  }
})

// DELETE product
apiRouter.delete('/products/:id', async (req, res) => {
  const productId = Number(req.params.id)
  if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' })

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const productResult = await client.query('SELECT part_number FROM products WHERE id = $1', [productId])
      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Product not found' })
      }
      const movementResult = await client.query('SELECT 1 FROM stock_movements WHERE part_number = $1 LIMIT 1', [productResult.rows[0].part_number])
      if (movementResult.rows.length > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Product has stock movement/history. Set the product status to Inactive instead of deleting it.' })
      }
      await client.query('DELETE FROM products WHERE id = $1', [productId])
      await client.query('COMMIT')
      res.json({ message: 'Product deleted successfully' })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (DELETE /products):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== STOCK MOVEMENTS ==========
// GET stock movements
apiRouter.get('/stock-movements', async (req, res) => {
  try {
    const client = await pool.connect()
    try {
      const result = await client.query(`SELECT id, operation_type, stock_card_no, adjustment_reason, part_number, quantity, location, stock_status_type, shipment, poc_key_in, remark, created_at FROM stock_movements ORDER BY id ASC`)
      res.json(result.rows)
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (GET /stock-movements):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST stock movement
apiRouter.post('/stock-movements', async (req, res) => {
  const { operation_type, stock_card_no, adjustment_reason, part_number, quantity, location, stock_status_type, shipment, poc_key_in, remark } = req.body
  try {
    const client = await pool.connect()
    try {
      await ensureStockStatusTypeConstraint(client)
      await ensureProductStatusColumn(client)

      const productResult = await client.query('SELECT status FROM products WHERE part_number = $1', [part_number])
      if (productResult.rows.length === 0) return res.status(400).json({ error: 'Part number not found. Please create product master first.' })
      if (productResult.rows[0].status === 'Inactive') return res.status(409).json({ error: 'Product is Inactive. Set it to Active before creating a new stock entry.' })

      const result = await client.query(
        `INSERT INTO stock_movements (operation_type, stock_card_no, adjustment_reason, part_number, quantity, location, stock_status_type, shipment, poc_key_in, remark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [operation_type, stock_card_no, adjustment_reason, part_number, quantity, location, stock_status_type, shipment, poc_key_in, remark]
      )
      res.json({ message: 'Stock movement saved', movement: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (POST /stock-movements):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// DELETE stock movement
apiRouter.delete('/stock-movements/:id', async (req, res) => {
  const movementId = Number(req.params.id)
  if (!Number.isInteger(movementId) || movementId <= 0) return res.status(400).json({ error: 'Invalid stock movement id' })

  try {
    const client = await pool.connect()
    try {
      const result = await client.query('DELETE FROM stock_movements WHERE id = $1 RETURNING *', [movementId])
      if (result.rows.length === 0) return res.status(404).json({ error: 'Stock movement not found' })
      res.json({ message: 'Stock movement deleted successfully', movement: result.rows[0] })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('DB error (DELETE /stock-movements):', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ========== FINAL MIDDLEWARE ==========
app.use('/', apiRouter)
app.use('/api', apiRouter)

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON request body.' })
  }
  next(err)
})

app.use((req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' })
})

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Datacom Inventory API running on port ${PORT}`)
  })
}

module.exports = app