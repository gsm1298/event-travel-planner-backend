import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// Import service layer classes
import { AuthService } from './service/AuthService.js';
import { EventService } from './service/EventService.js';
import { FlightService } from './service/FlightService.js';
import { OrganizationService } from './service/OrganizationService.js';
import { UserService } from './service/UserService.js';
import { logger, middleware } from './service/LogService.mjs';

const server = express();

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

server.use(cors({ origin: `${process.env.frontend_url}`, credentials: true }));

// For using req.body.x
server.use(bodyParser.json({ limit: '5mb' }));

// For getting JWT
server.use(cookieParser());

//for middleware logging events
server.use(middleware);

// Set the api's baseurl
const apiRouter = express.Router();
server.use('/api', apiRouter);

// Add services
new AuthService(apiRouter); // Also sets authenticator middleware
new EventService(apiRouter);
new FlightService(apiRouter);
new OrganizationService(apiRouter);
new UserService(apiRouter);

server.listen(process.env.server_port, () => {
    logger.http(`Server Starting on ${process.env.server_url} listening on port ${process.env.server_port}`);
});