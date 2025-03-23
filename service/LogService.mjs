import winston, { transports } from 'winston';
const { combine, timestamp, json, colorize, errors } = winston.format;

//general logging formatting and file handling

const consolePrintf = winston.format.printf((info) => {
    return `[${info.timestamp}] [${info.level.toUpperCase()}]: ${info.message}`;
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

//logging configuration
const customconfig = {
    transports: [ //where the outputs get sent to
        new transports.Console({ level: "http", format: consoleFormat }), //console output as formatted by the consoleFormat custom format
        new transports.File({ level: "silly", format: logFormat, filename: '../logs/standard.log' }), //log file output as formatted by the logFormat custom format
    ],
    exceptionHandlers: [ //handle uncaught exceptions
        new transports.File({ filename: '../logs/exceptions.log' }) //sent to file
    ],
    rejectionHandlers: [ //handle promise rejections
        new transports.File({ filename: '../logs/rejections.log' }), //sent to file
    ]
};

//exports the logger object
export let logger = new winston.createLogger(customconfig); //export logger object