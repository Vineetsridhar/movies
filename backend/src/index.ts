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
const CREDITSTABLE = "credits";
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

interface Crew {
    credit_id: string,
    department: string,
    gender: number,
    id: number,
    job: string,
    name: string,
}

interface Actor {
    credit_id: string,
    cast_id: number,
    character: string,
    department: string,
    gender: number,
    id: number,
    job: string,
    name: string,
    order: number
}

interface Credits {
    crew: string,
    actors: string,
    id: number
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

//#region Helper methods
function isAlphaNumeric(code: number): boolean {
    return (code > 64 && code < 91) || (code > 96 && code < 123) || (code > 47 && code < 58);
}
/*
 * DB contains json object with single quotes
 * Text like 'O'neil' needs to be replaced with "O'neil"
 */
function cleanString(result: String): string {
    const output = [];
    for (let i = 0; i < result.length; i++) {
        if (result.charAt(i) === "\'") {
            if (i > 0 && i < result.length) {
                const prevCharCode = result.charCodeAt(i - 1);
                const nextCharCode = result.charCodeAt(i + 1);

                if (!isAlphaNumeric(prevCharCode) || !isAlphaNumeric(nextCharCode)) {
                    output.push("\"");
                } else {
                    output.push("\'")
                }
            }
        } else {
            output.push(result.charAt(i))
        }
    }
    return output.join("");
}
//#endregion

//#region Define GraphQL Objects
const ActorType = new GraphQLObjectType({
    name: 'Actor',
    description: 'This object represents an Actor',
    fields: () => ({
        credit_id: { type: GraphQLString },
        cast_id: { type: GraphQLInt },
        character: { type: GraphQLString },
        department: { type: GraphQLString },
        gender: { type: GraphQLInt },
        id: { type: GraphQLInt },
        job: { type: GraphQLString },
        name: { type: GraphQLString },
        order: { type: GraphQLInt },
    })
})

const CrewType = new GraphQLObjectType({
    name: 'Crew',
    description: 'This object represents a crew member',
    fields: () => ({
        credit_id: { type: GraphQLString },
        department: { type: GraphQLString },
        gender: { type: GraphQLInt },
        id: { type: GraphQLInt },
        job: { type: GraphQLString },
        name: { type: GraphQLString },
    })
})

const CreditType = new GraphQLObjectType({
    name: 'Credit',
    description: 'This object represents a movie credit',
    fields: () => ({
        crew: {
            type: GraphQLList(CrewType),
            resolve: (credit: Credits) => {
                try {
                    //Replace apostrophes with quotes and None wil null for JSON parsing
                    credit["crew"] = cleanString(credit["crew"]).replace(/None/g, "null");
                    return JSON.parse(credit["crew"]);
                } catch (err) {
                    logger.error("Error when parsing crew members")
                    return []
                }
            }
        },
        actors: {
            type: GraphQLList(ActorType),
            resolve: (credit: Credits) => {
                try {
                    //Replace apostrophes with quotes and None wil null for JSON parsing
                    cleanString(credit["actors"])
                    credit["actors"] = cleanString(credit["actors"]).replace(/None/g, "null");
                    return JSON.parse(credit["actors"]);
                } catch (err) {
                    logger.error("Error when parsing actors members")
                    return []
                }
            }
        },
        id: { type: GraphQLNonNull(GraphQLInt) }
    })
})

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
            resolve: async (movie: Movie) => await makeQuery(`SELECT * FROM ${RATINGSTABLE} WHERE movieid = ${movie.id}`)
        },
        credits: {
            type: GraphQLList(CreditType),
            resolve: async (movie: Movie) => await makeQuery(`SELECT * FROM ${CREDITSTABLE} WHERE id=${movie.id}`)
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

//#region Express listner
app.use('/graphql', graphqlHTTP({
    schema,
    graphiql: true
}))

//start the Express server
app.listen(port, () => {
    logger.info(`Server has been started on port ${port}`)
});
//#endregion