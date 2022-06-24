
const { sequelize } = require('./model')
const { Op } = require('sequelize')
async function getContractById (id, profileId) {
  const { Contract } = sequelize.models
  if (!id) throw new Error('No contract id is provided')
  if (!profileId) throw new Error('No profile id is provided')
  const contract = await Contract.findOne({
    where: {
      [Op.and]: [{
        id
      }, {
        [Op.or]: [{
          ContractorId: profileId
        }, {
          ClientId: profileId
        }]
      }]
    }
  })

  return contract
}

async function getContractsByUserId (id) {
  const { Contract } = sequelize.models
  if (!id) throw new Error('No user id is provided')
  const contracts = await Contract.findAll({
    where: {
      [Op.and]: [{
        status: { [Op.eq]: 'in_progress' }
      }, {
        [Op.or]: [{
          ContractorId: id
        }, {
          ClientId: id
        }]
      }]
    }
  })
  return contracts
}

async function getUnpaidJobs (id) {
  const { Job, Contract } = sequelize.models
  if (!id) throw new Error('No user id is provided')
  const jobs = await Job.findAll({
    where: {
      paid: { [Op.eq]: null }
    },
    include: [{
      model: Contract,
      where: {
        [Op.and]: [{
          status: { [Op.ne]: 'terminated' }
        }, {
          [Op.or]: [{
            ContractorId: id
          }, {
            ClientId: id
          }]
        }]
      },
      attributes: ['status']
    }]
  })

  return jobs
}

async function payByJobId (id, clientId) {
  const { Job, Contract, Profile } = sequelize.models
  const t = await sequelize.transaction()
  try {
    const job = await Job.findOne({
      where: { id },
      include: [{
        model: Contract,
        where: { ClientId: clientId },
        include: [{
          model: Profile,
          as: 'Client'
        }]
      }]
    })
    if (!job) throw new Error('No job found')
    if (job.paid) throw new Error('Job has been paid already')
    const jobPrice = job.price
    const clientBalance = job.Contract.Client.balance
    if (clientBalance < jobPrice) throw new Error('Insufficient funds to pay for this job')

    const contractor = await Profile.findOne({
      where: {
        id: job.Contract.ContractorId
      },
      attributes: ['id', 'balance']
    })

    const newClientBalance = clientBalance - jobPrice
    const newContractorBalance = contractor.balance + jobPrice
    await Profile.update({ balance: newClientBalance }, { where: { id: clientId } }, { transaction: t })
    await Profile.update({ balance: newContractorBalance }, { where: { id: contractor.id } }, { transaction: t })
    await Job.update({
      paid: 1,
      paymentDate: Date.now()
    }, { where: { id } }, { transaction: t })

    await t.commit()
  } catch (e) {
    await t.rollback()
    throw e
  }

  return true
}

async function fillBalance (userId, amount) {
  const { Job, Contract, Profile } = sequelize.models
  const t = await sequelize.transaction()
  try {
    const client = await Profile.findOne({
      where: {
        id: userId
      },
      include: [{
        model: Contract,
        as: 'Client',
        include: [{
          model: Job,
          where: {
            paid: { [Op.eq]: null }
          },
          attributes: ['price']
        }]
      }]
    })
    if (!client) throw new Error('No client found')
    const jobs = client.Client.map(contract => (contract.Jobs.map(job => job.price))).flat()
    const amountToPay = jobs.reduce((acc, job) => acc + job)
    if (Math.abs(amount) > amountToPay * 0.25) throw new Error('Can\'t deposit more than 25% your total of jobs to pay')
    await Profile.update({
      balance: client.balance + Math.abs(amount)
    }, { where: { id: userId } }, { transaction: t })

    await t.commit()
  } catch (e) {
    await t.rollback()
    throw e
  }

  return true
}

async function getBestProfesion (start, end) {
  const { Contract, Profile, Job } = sequelize.models
  const bestProfessions = await Profile.findAll({
    where: {
      type: 'contractor'
    },
    attributes: [
      'profession',
      [sequelize.fn('sum', sequelize.col('price')), 'total_sum']
    ],
    group: ['profession'],
    order: sequelize.literal('total_sum DESC'),
    include: [{
      model: Contract,
      as: 'Contractor',
      include: [{
        model: Job,
        where: {
          [Op.and]: [{
            paid: { [Op.ne]: null }
          }, {
            paymentDate: { [Op.between]: [new Date(parseInt(start)), new Date(parseInt(end))] }
          }
          ]
        }
      }]
    }]
  })
  return bestProfessions[0].profession
}

async function getBestClients (start, end, limit = 2) {
  const { Contract, Profile, Job } = sequelize.models
  const bestClients = await Profile.findAll({
    where: {
      type: 'client'
    },
    attributes: [
      'id',
      'firstName',
      'lastName',
      [sequelize.fn('sum', sequelize.col('price')), 'total_sum']
    ],
    group: ['Profile.id'],
    order: sequelize.literal(`total_sum DESC LIMIT ${limit}`),
    include: [{
      model: Contract,
      as: 'Client',
      include: [{
        model: Job,
        where: {
          [Op.and]: [{
            paid: { [Op.ne]: null }
          }, {
            paymentDate: { [Op.between]: [new Date(parseInt(start)), new Date(parseInt(end))] }
          }
          ]
        }
      }]
    }]
  })
  const response = bestClients.map(client => ({
    id: client.id,
    fullName: `${client.firstName} ${client.lastName}`,
    paid: client.dataValues.total_sum
  }))
  return response
}

module.exports = {
  getContractById,
  getContractsByUserId,
  getUnpaidJobs,
  payByJobId,
  fillBalance,
  getBestProfesion,
  getBestClients
}
