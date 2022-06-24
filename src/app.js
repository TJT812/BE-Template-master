const express = require('express')
const bodyParser = require('body-parser')
const { sequelize } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const { getContractById, getContractsByUserId, getUnpaidJobs, payByJobId, fillBalance, getBestProfesion, getBestClients } = require('./service')
const app = express()
app.use(bodyParser.json())
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
  const { id } = req.params
  let contract
  if (!id) return res.status(400).end()
  try {
    contract = await getContractById(id, req.profile.id)
  } catch (err) {
    console.error(err)
    return res.status(500).end()
  }
  if (!contract) return res.status(404).send('Nothing is found')
  res.json(contract)
})

/**
 * @returns non terminated contracts of the user
 */
app.get('/contracts', getProfile, async (req, res) => {
  let contracts
  try {
    contracts = await getContractsByUserId(req.profile.id)
  } catch (err) {
    console.error(err)
    return res.status(500).end()
  }
  if (contracts.length === 0) return res.status(404).send('Nothing is found')
  res.json(contracts)
})

/**
 * @returns unpaid active jobs of the user
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
  let jobs
  try {
    jobs = await getUnpaidJobs(req.profile.id)
  } catch (err) {
    console.error(err)
    return res.status(500).end()
  }
  if (jobs.length === 0) return res.status(404).send('Nothing is found')
  res.json(jobs)
})

/**
 * @returns '{ success: true }' if successfully paid for the job
 */
app.post('/jobs/:job_id/pay', getProfile, async (req, res) => {
  const { job_id } = req.params
  if (!job_id) return res.status(400).end()
  try {
    const result = await payByJobId(job_id, req.profile.id)
    res.json({ success: result })
  } catch (err) {
    console.error(err)
    res.json({ success: false, msg: err.message })
  }
})

/**
 * @returns '{ success: true }' if successfully filled the balance
 */
app.post('/balances/deposit/:userId', getProfile, async (req, res) => {
  const { userId } = req.params
  const amount = req.body.amount
  if (userId != req.profile.id) return res.status(401).end()
  if (!userId || !amount) return res.status(400).end()
  try {
    const result = await fillBalance(userId, amount)
    res.json({ success: result })
  } catch (err) {
    console.error(err)
    res.json({ success: false, msg: err.message })
  }
})

/**
 * @returns best profession
 */
app.get('/admin/best-profession', getProfile, async (req, res) => {
  const { start, end } = req.query
  let profession
  try {
    profession = await getBestProfesion(start, end)
  } catch (err) {
    console.error(err)
    return res.status(500).end()
  }
  if (!profession) return res.status(404).send('Nothing is found')
  res.json({ bestProfession: profession })
})

/**
 * @returns best clients
 */
app.get('/admin/best-clients', getProfile, async (req, res) => {
  const { start, end, limit } = req.query
  let clients
  try {
    clients = await getBestClients(start, end, limit)
  } catch (err) {
    console.error(err)
    return res.status(500).end()
  }
  if (!clients) return res.status(404).send('Nothing is found')
  res.json({ clients: clients })
})

module.exports = app
