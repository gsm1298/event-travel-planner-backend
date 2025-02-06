import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// Import service layer classes
import { AuthService } from './service/AuthService.js';

const server = express();

server.use(cors({ origin: 'http://localhost:5173', credentials: true }));

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