import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';

// Import service layer classes
import { AuthService } from './service/AuthService.js';

const server = express();

dotenv.config();

// For using req.body.x
server.use(bodyParser.json());

// For getting JWT
server.use(cookieParser());

// Set the api's baseurl
const apiRouter = express.Router();
server.use('/api', apiRouter);

// Add services
new AuthService(apiRouter); // Also sets authenticator middleware

server.listen(3000, () => {
    console.log('Server Starting on http://localhost:3000');
});