//#region Imports
import express = require('express');
import winston = require("winston");
import { resolve } from 'path';
const { Pool, Client } = require('pg')
const { graphqlHTTP } = require("express-graphql");
const {
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLList,
    GraphQLInt,
    GraphQLNonNull
} = require('graphql')
//#endregion Imports

//#region Define initial variables
const app = express();
const port = 5000;
require('dotenv').config()
const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});
const pool = new Pool({
    user: process.env.DBUSER,
    host: process.env.DBHOST,
    database: process.env.DB,
    password: process.env.DBPSSWD,
    port: 5432,
})
//#endregion

//#region SQL Queries
function makeQuery(query:string){
    return pool.query(query);
}
//#endregion

//#region Define GraphQL Objects
const MovieType = new GraphQLObjectType({
    name: 'Movie',
    description: 'This object represents a movie type',
    fields: () => ({
        adult: {type: GraphQLString},
        belongs_to_collection: {type: GraphQLString},
        budget: {type: GraphQLString},
        genres: {type: GraphQLString},
        homepage: {type: GraphQLString},
        id: {type: GraphQLString},
        imdb_id: {type: GraphQLString},
        original_language: {type: GraphQLString},
        original_title: {type: GraphQLString},
        overview: {type: GraphQLString},
    })
})

const RootQueryType = new GraphQLObjectType({
    name: 'Query',
    description: 'Root Query',
    fields: () => ({
        movies: {
            type: GraphQLList(MovieType),
            description: 'List of all movies',
            resolve: async () => {
                let movies = await makeQuery("SELECT * FROM movies");
                return movies["rows"];
            }
        }
    })
})


const schema = new GraphQLSchema({
    query: RootQueryType
})
//#endregion


app.use('/graphql', graphqlHTTP({
    schema,
    graphiql: true
}))

//start the Express server
app.listen(port, () => {
    logger.info(`Server has been started on port ${port}`)
});