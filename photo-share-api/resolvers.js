const { GraphQLScalarType } = require('graphql')
const { authorizeWithGithub } = require('./lib.js')
const fetch = require('node-fetch')

module.exports = {
    Query: {
        totalPhotos: (parent, args, { db }) => db.collection('photos').estimatedDocumentCount(),
        allPhotos: (parent, args, { db }) => db.collection('photos').find().toArray(),
        totalUsers: (parent, args, { db }) => db.collection('users').estimatedDocumentCount(),
        allUsers: (parent, args, { db }) => db.collection('users').find().toArray(),
        me: (parent, args, { currentUser }) => currentUser
    },
    Mutation: {
        async postPhoto(parent, args, { db, currentUser, pubsub }) {
            if(!currentUser) {
                throw new Error('Not authorized!')
            }
            let newPhoto = {
                ...args.input,
                userID: currentUser.githubLogin,
                created: new Date()
            }
            const { insertedIds } = await db.collection('photos').insert(newPhoto)
            newPhoto.id = insertedIds[0]
            
            pubsub.publish('photo-added', { newPhoto })

            return newPhoto
        },
        async githubAuth(parent, { code }, { db }) {
            let {
                message,
                access_token,
                avatar_url,
                login,
                name
            } = await authorizeWithGithub({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                code
            })

            if(message) {
                throw new Error(message)
            }

            const latestUserInfo = {
                name,
                githubLogin: login,
                githubToken: access_token,
                avatar: avatar_url
            }
            
            await db
                .collection('users')
                .replaceOne({ githubLogin: login }, latestUserInfo, { upsert: true })

            const user = await db.collection('users').findOne({ githubLogin: login }, latestUserInfo)


            return { user, token: access_token }
        },
        addFakeUsers: async (parent, { count }, { db }) => {
            let { results } = await fetch(`https://randomuser.me/api/?results=${count}`)
                .then(res => res.json())

            let users = results.map(r => ({
                githubLogin: r.login.username,
                name: `${r.name.first} ${r.name.last}`,
                avatar: r.picture.thumbnail,
                githubToken: r.login.sha1
            }))

            await db.collection('users').insert(users)

            return users
        },
        async fakeUserAuth (parent, { githubLogin }, { db }) {
            let user = await db.collection('users').findOne({ githubLogin })

            if(!user) {
                throw new Error(`Cannot find user with githubLogin "${githubLogin}"`)
            }

            return {
                token: user.githubToken,
                user
            }
        }
    },
    Subscription: {
        newPhoto: {
            subscribe: (parent, args, { pubsub }) => pubsub.asyncIterator('photo-added')
        }
    },
    Photo: {
        // trivial resolver
        id: parent => parent.id || parent._id,
        url: parent => `/img/photos/${parent._id}.jpg`,
        postedBy: (parent, args, { db }) => {
            return db.collection('users').findOne({ githubLogin: parent.userID })
        },
        taggedUsers: parent => tags
            .filter(tag => tag.photoID === parent.id)
            .map(tag => tag.userID)
            .map(userID => users.find(u => u.githubLogin === userID))

    },
    User: {
        postedPhotos: parent => {
            return photos.filter(p => p.githubUser === parent.githubLogin)
        },
        inPhotos: parent => tags
            .filter(tag => tag.userID === parent.id)
            .map(tag => tag.photoID)
            .map(photoID => photos.find(p => p.id === photoID))
    },
    DateTime: new GraphQLScalarType({
        name: 'DateTime',
        description: 'A valid date time value',
        parseValue: value => new Date(value),
        serialize: value => new Date(value).toISOString(),
        parseLiteral: ast => ast.value
    })
}