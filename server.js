import express from 'express';
import dotenv from 'dotenv';

const server = express();

dotenv.config()

server.listen(3000, () => {
    console.log('Server Starting on http://localhost:3000');
});