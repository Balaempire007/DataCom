const { Client } = require('pg')

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'inventory_db'
})

async function connectDB() {
  try {
    await client.connect()
    console.log('✅ PostgreSQL Connected')

    const result = await client.query('SELECT NOW()')
    console.log(result.rows)
  } catch (err) {
    console.error('❌ Connection Error:', err.message)
  } finally {
    await client.end()
  }
}

connectDB()
