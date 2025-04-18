import winston, { transports } from 'winston';
import morgan from 'morgan';
const { combine, timestamp, json, colorize, errors } = winston.format;

//WINSTON===============================================================

//general logging formatting and file handling

const consolePrintf = winston.format.printf((info) => {
    const logParts = [`[${info.timestamp}] [${info.level.toUpperCase()}]`];

    if (info.method) {
        logParts.push(info.method);
    }

    if (info.message) {
        logParts.push(info.message);
    }

    if (info.url) {
        logParts.push(`URL: ${info.url}`);
    }

    if (info.stack) {
        logParts.push(`Stack Trace: ${info.stack}`);
    }

    return logParts.join(' '); // Join all populated parts with a space

});

const consoleFormat = combine(
    timestamp(),
    consolePrintf,  //use custom printf statement declared above to format console output (prettyfy it)
    colorize({ all: true })
);

const logFormat = combine(
    timestamp(),
    errors({ stack: true }),  //output the stack trace to the error log when it is an error object (caught or uncaught)
    json() //format as json for ease of parsing later
);

const whiteListVerbose = winston.format((info) => {
    if(info.level != 'verbose'){
        return false; //if not verbose return false
    }
    return info; //return only verbose
});

const whiteListError = winston.format((info) => {
    if(info.level != 'error'){
        return false; //if not error return false
    }
    return info; //return only error
});

const verboseFormat = combine(
    timestamp(),
    errors({ stack: true }),
    whiteListVerbose(),
    json()
);

const errorFormat = combine(
    timestamp(),
    errors({ stack: true }),
    whiteListError(),
    json()
);

const morganFormat = combine(
    timestamp(),
    json()
);

//logging configuration
const customconfig = {
    transports: [ //where the outputs get sent to
        new transports.Console({ level: "silly", format: consoleFormat }), //console output as formatted by the consoleFormat custom format CHANGE TO SILLY FOR DEBUGGING
        new transports.File({ level: "silly", format: logFormat, filename: '../logs/standard.log' }), //log file output as formatted by the logFormat custom format
        new transports.File({ level: "verbose", format: verboseFormat, filename: '../logs/audit.log' }), //log audit activities
        new transports.File({ level: "http", format: morganFormat, filename: '../logs/express.log' }),
        new transports.File({ level: "error", format: errorFormat, filename: '../logs/error.log' }) //log error activities
    ],
    exceptionHandlers: [ //handle uncaught exceptions
        new transports.File({ filename: '../logs/exceptions.log' }) //sent to file
    ],
    rejectionHandlers: [ //handle promise rejections
        new transports.File({ filename: '../logs/rejections.log' }), //sent to file
    ]
};

//exports the winston logger object
export let logger = new winston.createLogger(customconfig); //export logger object

//MORGAN=======================================================================

const morganMiddleware = morgan(
    function (tokens, req, res) {
        return JSON.stringify({
            method: tokens.method(req, res),
            url: tokens.url(req, res),
            status: Number.parseFloat(tokens.status(req, res)),
            content_length: tokens.res(req, res, 'content-length'),
            response_time: Number.parseFloat(tokens['response-time'](req, res)),
            user_agent: req.headers['user-agent'],
        })
    },
    {
        stream: {
            //configure morgan to use custom winston logger endpoint with http severity
            write: (message) => {
                var data = JSON.parse(message);
                logger.http('request', data);
        },
    },
});

//exports morgan logging endpoint to be bonded to express server
export let middleware = morganMiddleware; //export middleware object