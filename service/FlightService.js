import express from 'express';
import dotenv from 'dotenv';
import { Duffel } from '@duffel/api';

dotenv.config();

const duffel = new Duffel({
    token: process.env.duffelToken
})

export class FlightService {
    /**
     * @constructor
     * 
     * @param {express.Application} app
     */
    constructor(app) {
        app.post('/flights/search', this.search);
    }

    /**@type {express.RequestHandler} */
    async search(req, res) {
        var input = req.body;

        // Temp validation, move to Flight business layer once we start implementing DB
        const valid = (input.origin.length == 3 && input.destination.length == 3);
        if(!valid) {
            return res.status(401).json({ error: "Invalid Flight Origin and/or Destination" });
        };

        // Generate offer search and call duffel api
        var offers = await duffel.offerRequests.create({
            slices: [
                {
                    origin: input.origin,
                    destination: input.destination,
                    departure_date: input.departure_date
                }
            ],
            passengers: [
                {
                    type: "adult"
                }
            ],
            cabin_class: "economy"
        });

        var data = [];

        // Parse through api data and store necessary info to data
        offers.data.offers.forEach((o) => {
            data.push({
                offer_id: o.id,
                passenger_ids: o.passengers.map(p => p.id),
                airline: o.owner.name,
                price: o.total_amount,
                terminal: o.slices[0].segments[0].origin_terminal,
                origin_airport: o.slices[0].origin.iata_code,
                destination_airport: o.slices[0].destination.iata_code,
                departure_date: (o.slices[0].segments[0].departing_at).slice(0, 10),
                departure_time: (o.slices[0].segments[0].departing_at).slice(11,16),
                arrival_time: (o.slices[0].segments[0].arriving_at).slice(11,16),
                logo: o.slices[0].segments[0].operating_carrier.logo_symbol_url
            })
        });
    
        res.status(200).send(JSON.stringify(data));

    }
}