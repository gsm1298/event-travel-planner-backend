import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { Duffel } from '@duffel/api';
import zipcodes from 'zipcodes';

dotenv.config({path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`]});

const duffel = new Duffel({
    token: `${process.env.duffelToken}`
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

        // Temp validation
        if(input.destination.length != 3) {
            return res.status(401).json({ error: "Invalid Flight Origin and/or Destination" });
        };

        // Lookup client zip and get coords for Duffel call
        var client_coords = zipcodes.lookup(14437);

        // Call to Duffel to return list of closest airport codes
        var closest_airports = async() => {
            const response = await fetch(`https://api.duffel.com/places/suggestions?lat=${client_coords.latitude}&lng=${client_coords.longitude}&rad=85000`, {
                method: 'GET',
                headers: {
                    'Duffel-version': 'v2',
                    'Authorization': 'Bearer ' + process.env.duffelToken
                }
            })

            const parsed = await response.json();
            return parsed.data.map(airport => airport.iata_code)
        }

        var airports = await closest_airports();

        // Generate offer search and call Duffel api
        var offers = await duffel.offerRequests.create({
            slices: [
                {
                    origin: airports[0], // Defaulting origin to closest city
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

        data.push(airports);

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