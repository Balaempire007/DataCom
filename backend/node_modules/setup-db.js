const { Client } = require('pg')

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'inventory_db'
})

async function setupDB() {
  try {
    await client.connect()

    await await await client.query(`
  ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand VARCHAR(100),
  ADD COLUMN IF NOT EXISTS default_location VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS remark TEXT
`)

    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        operation_type VARCHAR(50) NOT NULL CHECK (
          operation_type IN ('Add Stock', 'Remove Stock', 'Adjustment')
        ),
        stock_card_no VARCHAR(100),
        adjustment_reason VARCHAR(150) CHECK (
          adjustment_reason IS NULL OR adjustment_reason IN (
            'Stock Take Correction',
            'Missing Stock',
            'Damaged Stock',
            'Wrong Entry Correction',
            'Location Correction',
            'Quantity Correction',
            'Others'
          )
        ),
        part_number VARCHAR(100) NOT NULL REFERENCES products(part_number) ON UPDATE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0,
        location VARCHAR(150) NOT NULL,
        stock_status_type VARCHAR(100) NOT NULL CHECK (
          stock_status_type IN (
            'Available',
            'Reserved',
            'Pending PO',
            'Modify',
            'Sold',
            'Showroom Unit',
            'Warranty Replacement',
            'Returned Stock',
            'Damaged Stock'
          )
        ),
        shipment VARCHAR(150),
        poc_key_in VARCHAR(100) NOT NULL,
        remark TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    console.log('Database tables created successfully')
  } catch (err) {
    console.error('Setup Error:', err.message)
  } finally {
    await client.end()
  }
}

setupDB()
