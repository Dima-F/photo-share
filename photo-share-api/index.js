require('dotenv').config()
const { MongoClient } = require('mongodb')
const express = require('express')
const { createServer } = require('http')
const { ApolloServer, PubSub } = require('apollo-server-express')
const { readFileSync } = require('fs')
const typeDefs = readFileSync('./typeDefs.graphql', 'UTF-8');
const expressPlayground = require('graphql-playground-middleware-express').default
const resolvers = require('./resolvers');
const path = require('path')

async function start() {
    const app = express()

    const client = await MongoClient.connect(
        process.env.DB_HOST,
        { useNewUrlParser: true }
    )

    const db = client.db()
    const pubsub = new PubSub()
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: async ({ req, connection }) => {
            const githubToken = req ? req.headers.authorization : connection.context.Authorization
            const currentUser = await db.collection('users').findOne({ githubToken })
            return { db, currentUser, pubsub }
        }
    })

    server.start().then(() => server.applyMiddleware({ app }))

    app.use('/img/photos', express.static(path.join(__dirname, 'assets', 'photos')))

    app.get('/', (req, res) => res.end('Welcome to the PhotoShare API'))

    app.get('/playground', expressPlayground({ endpoint: '/graphql' }))

    const httpServer = createServer(app)

    // this variant is only for outdated appollo-server-express version 2
    server.installSubscriptionHandlers(httpServer)

    httpServer.listen({ port: 4000 }, () => console.log(`GraphQL Server running at http://localhost:4000${server.graphqlPath}`))
}

start();
