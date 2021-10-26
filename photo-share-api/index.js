require('dotenv').config()
const { MongoClient } = require('mongodb')
const express = require('express')
// const { ApolloServer } = require('apollo-server')
const { ApolloServer } = require('apollo-server-express')
const { readFileSync } = require('fs')
const typeDefs = readFileSync('./typeDefs.graphql', 'UTF-8');
const expressPlayground = require('graphql-playground-middleware-express').default
const resolvers = require('./resolvers');

async function start() {
    const app = express()

    const client = await MongoClient.connect(
        process.env.DB_HOST,
        { useNewUrlParser: true }
    )

    const db = client.db()

    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: async ({ req }) => {
            const githubToken = req.headers.authorization
            const currentUser = await db.collection('users').findOne({ githubToken })
            return { db, currentUser }
        }
    })

    server.start().then(() => server.applyMiddleware({ app }))

    app.get('/', (req, res) => res.end('Welcome to the PhotoShare API'))

    app.get('/playground', expressPlayground({ endpoint: '/graphql' }))

    app.listen({ port: 4000 }, () => console.log(`GraphQL Server running at http://localhost:4000${server.graphqlPath}`))
}

start();
