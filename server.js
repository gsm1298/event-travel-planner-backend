import express from 'express';

const server = express();

server.listen(3000, () => {
    console.log('Server Starting on http://localhost:3000');
});