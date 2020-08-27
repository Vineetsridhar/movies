//#region Imports
import express = require('express');
import winston = require("winston");
const { Pool } = require('pg')
const { graphqlHTTP } = require("express-graphql");
const {
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLList,
    GraphQLInt,
    GraphQLNonNull,
    GraphQLFloat
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
});

const MOVIETABLE = "movies";
const RATINGSTABLE = "ratings";
//#endregion

//#region Define Interfaces
interface Movie {
    adult: string,
    belongs_to_collection: string,
    budget: string,
    genres: string,
    homepage: string,
    id: number,
    imdb_id: number,
    original_language: string,
    original_title: string,
    overview: string,
}
interface Rating {
    userid: number,
    movieid: number,
    rating: number,
    timestamp: number
}
//#endregion

//#region SQL Queries
async function makeQuery(query: string) {
    let ret;
    try {
        ret = await pool.query(query);
        return ret["rows"];
    } catch (err) {
        logger.error(err);
    }
}
//#endregion


//#region Define GraphQL Objects
const RatingType = new GraphQLObjectType({
    name: 'Rating',
    description: 'This object represents a Rating',
    fields: () => ({
        userid: { type: GraphQLNonNull(GraphQLInt) },
        movieid: { type: GraphQLNonNull(GraphQLInt) },
        rating: { type: GraphQLNonNull(GraphQLFloat) },
        timestamp: { 
            type: GraphQLString,
            resolve: (rating: Rating) => new Date(rating.timestamp * 1000).toDateString()
        },
    })
})


const MovieType = new GraphQLObjectType({
    name: 'Movie',
    description: 'This object represents a movie',
    fields: () => ({
        adult: { type: GraphQLString },
        belongs_to_collection: { type: GraphQLString },
        budget: { type: GraphQLString },
        genres: {
            type: GraphQLList(GraphQLString),
            resolve: (movie: Movie) => {
                try {
                    //Replace apostrophes with quotation marks to be parsed properly
                    const genres = JSON.parse(movie["genres"].replace(/'/g, "\""));
                    return genres.map((genre: { id: number, name: string }) => {
                        return genre.name
                    })
                } catch (err) {
                    logger.error("Error when parsing genres")
                    return []
                }
            }
        },
        homepage: { type: GraphQLString },
        id: { type: GraphQLNonNull(GraphQLInt) },
        imdb_id: { type: GraphQLNonNull(GraphQLInt) },
        original_language: { type: GraphQLString },
        original_title: { type: GraphQLString },
        overview: { type: GraphQLString },
        ratings: {
            type: GraphQLList(RatingType),
            resolve: async (movie:Movie) => await makeQuery(`SELECT * FROM ${RATINGSTABLE} WHERE movieid = ${movie.id}`)
        }
    })
})

const RootQueryType = new GraphQLObjectType({
    name: 'Query',
    description: 'Root Query',
    fields: () => ({
        movies: {
            type: GraphQLList(MovieType),
            description: 'List of all movies',
            resolve: async () => await makeQuery(`SELECT * FROM ${MOVIETABLE}`)
        },
        movie: {
            type: MovieType,
            description: 'Singular movie query',
            args: {
                id: { type: GraphQLNonNull(GraphQLInt) }
            },
            resolve: async (parent: Movie, args: { id: string }) => (await makeQuery(`SELECT * FROM ${MOVIETABLE} WHERE id='${args.id}'`))[0]
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