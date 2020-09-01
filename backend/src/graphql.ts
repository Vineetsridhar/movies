//#region Imports
import winston = require("winston");
const { Pool } = require('pg')
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
console.log(pool)
async function startServer(){
    let retries = 8;
    while(retries){
        try{ 
            await pool.connect()
            console.log("Connected!")
            break;
        } catch(err){
            console.log("retrying", err);
            retries--;
            await new Promise(res => setTimeout(res, 5000))
        }
    }
}
startServer()



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
    try {
        let result = await pool.query(query);
        return result["rows"];
    } catch (err) {
        logger.error("Error completing SQL Query");
    }
}
//#endregion

//#region Helper methods
/*
 * DB contains json object with single quotes
 * Signle quotes like in "O'neil" should not be converted
 */
function cleanString(result: string): string {
    const output = [];
    let insideQuotes = false;
    for (let i = 0; i < result.length; i++) {
        if (result.charAt(i) === "\'") {
            if (insideQuotes) {
                output.push("\'");
            } else {
                output.push("\"")
            }
        } else if (result.charAt(i) === "\"") {
            insideQuotes = !insideQuotes;
            output.push(result.charAt(i))
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
            args: {
                offset: { type: GraphQLInt },
                count: { type: GraphQLInt }
            },
            resolve: (credit: Credits, args: { offset: number, count: number }) => {
                try {
                    credit["crew"] = cleanString(credit["crew"]).replace(/None/g, "null");
                    let rows = JSON.parse(credit["crew"]);

                    const start = (args.offset && args.offset >= 0 ? args.offset : 0);
                    const end = (args.count && args.count >= 0 ? args.count : rows.length) + start;

                    return rows.slice(start, end)
                } catch (err) {
                    logger.error("Error when parsing crew members")
                    return []
                }
            }
        },
        actors: {
            type: GraphQLList(ActorType),
            args: {
                offset: { type: GraphQLInt },
                count: { type: GraphQLInt }
            },
            resolve: (credit: Credits, args: { offset?: number, count?: number }) => {
                try {
                    credit["actors"] = cleanString(credit["actors"]).replace(/None/g, "null").replace(/""/g, "\"");
                    let rows: any[] = JSON.parse(credit["actors"]);

                    const start = (args.offset ? args.offset : 0);
                    const end = (args.count ? args.count : rows.length) + start;

                    return rows.slice(start, end)
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
                    //Replace single quotes with double quotes to be parsed properly
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
        overview: { type: GraphQLString, description: "Description of the movie" },
        ratings: {
            type: GraphQLList(RatingType),
            description:"All ratings from a movie",
            args:{
                offset:{type:GraphQLInt},
                count:{type:GraphQLInt}
            },
            resolve: async (movie: Movie, args: { offset?: number, count?: number }) => {
                let baseQuery = [`SELECT * FROM ${RATINGSTABLE} WHERE movieid = ${movie.id}`];

                if (args.offset && args.offset >= 0) baseQuery.push(`OFFSET ${args.offset} ROWS`);
                if (args.count && args.count >= 0) baseQuery.push(`FETCH NEXT ${args.count} ROWS ONLY`);

                return await makeQuery(baseQuery.join(" "));
            }
        },
        averageRating:{
            type: GraphQLFloat,
            description: "Average rating of a movie",
            resolve: async (movie:Movie) => (await makeQuery(`SELECT AVG(rating) FROM ${RATINGSTABLE} WHERE movieid = ${movie.id}`))[0]["avg"]
        },
        credits: {
            type: GraphQLList(CreditType),
            description: "Get the crew members of a movie",
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
            description: 'List of some movies. Offset -> Starting point. Count -> Number of rows to return',
            args: {
                offset: { type: GraphQLInt },
                count: { type: GraphQLInt }
            },
            resolve: async (_: Movie, args: { offset?: number, count?: number }) => {
                //Strings are immutable
                let baseQuery = [`SELECT * FROM ${MOVIETABLE}`];

                if (args.offset && args.offset >= 0) baseQuery.push(`OFFSET ${args.offset} ROWS`);
                if (args.count && args.count >= 0) baseQuery.push(`FETCH NEXT ${args.count} ROWS ONLY`);

                return await makeQuery(baseQuery.join(" "));
            }
        },
        movie: {
            type: MovieType,
            description: 'Singular movie query',
            args: {
                id: { type: GraphQLNonNull(GraphQLInt) }
            },
            resolve: async (_: Movie, args: { id: string }) => (await makeQuery(`SELECT * FROM ${MOVIETABLE} WHERE id='${args.id}'`))[0]
        }
    })
})

const schema = new GraphQLSchema({
    query: RootQueryType
})
//#endregion

module.exports = schema;
