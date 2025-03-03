import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { Duffel } from '@duffel/api';
import zipcodes from 'zipcodes';
import { User } from '../business/User.js';

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

        app.post('/flights/hold', this.hold);

        app.post('/flights/booking', this.booking);
    }

    /**@type {express.RequestHandler} */
    async search(req, res) {
        var input = req.body;

        try {
            // Temp validation
            if(input.destination.length != 3) {
                return res.status(400).json({ error: "Invalid Flight Origin and/or Destination" });
            };

            // Lookup client zip and get coords for Duffel call
            var client_coords = zipcodes.lookup(input.zip);

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
        } catch(err) {
            console.error("Error at Flight Search:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }


        // Instantiate offers before the try/catch block for scoping
        var offers;

        try {
            // Generate offer search and call Duffel api
            offers = await duffel.offerRequests.create({
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
                var stops = null;

            if(o.slices[0].segments.length > 1) {
                stops = [];

                o.slices[0].segments.forEach((s) => {
                    stops.push({
                        origin_code: s.origin.iata_code,
                        origin_name: s.origin.name,
                        destination_code: s.destination.iata_code,
                        destination_name: s.destination.name,
                        duration: (s.duration).slice(2),
                        terminal: s.origin_terminal,
                        departure_time: (s.departing_at).slice(11,16),
                        arrival_time: (s.arriving_at).slices(11,16),
                        flight_num: o.slices[0].segments[0].operating_carrier_flight_number
                    })
                })
            }

            data.push({
                    offer_id: o.id,
                    passenger_ids: o.passengers[0].id,
                    airline: o.owner.name,
                    price: o.total_amount,
                    duration: (o.slices[0].duration).slice(2), // ##H##M format
                    terminal: o.slices[0].segments[0].origin_terminal,
                    flight_num: o.slices[0].segments[0].operating_carrier_flight_number,
                    origin_airport: o.slices[0].origin.iata_code,
                    destination_airport: o.slices[0].destination.iata_code,
                    departure_date: (o.slices[0].segments[0].departing_at).slice(0, 10),
                    departure_time: (o.slices[0].segments[0].departing_at).slice(11,16),
                    arrival_time: (o.slices[0].segments[0].arriving_at).slice(11,16),
                    logo: o.slices[0].segments[0].operating_carrier.logo_symbol_url,
                    itinerary: stops //Defaults to NULL
                })
            });
        
            res.status(200).send(JSON.stringify(data));
        } catch (err) {
            console.error("Error at Offer Search:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /**@type {express.RequestHandler} */
    async hold(req, res) {
        var input = req.body;

        var user = User.GetUserById(res.locals.user.id);

        try {
            var confirmation = await duffel.orders.create({
                selected_offers: [input.orderID],
                type: "pay_later",
                passengers: [
                    {   
                        id: input.passID,
                        given_name: user.firstName,
                        family_name: user.lastName,
                        title: user.title,
                        gender: user.gender,
                        phone_number: "+1" + user.phoneNum,
                        email: user.email,
                        born_on: user.dob
                    }
                ]
            })

            var data = {
                offer_id: confirmation.offer_id,
                total: confirmation.total_amount,
                expiration: confirmation.payment_status.payment_required_by
            } 

            res.status(200).send(json.stringify(data));

        } catch (error) {
            console.error("Error at Booking: ", err);
            res.status(500).json({ error: "Internal Server Error"});
        }
    }

    //WIP
    /**@type {express.RequestHandler} */
    async booking(req, res) {
        var input = req.body;

        var user = User.GetUserById(res.locals.user.id);

        duffel.orders.create({
            selected_offers: [input.orderID],
            type: "instant",
            passengers: [
                {   
                    id: input.passID,
                    given_name: user.firstName,
                    family_name: user.lastName,
                    title: user.title,
                    gender: user.gender,
                    phone_number: user.phoneNum,
                    email: user.email,
                    born_on: user.dob
                }
            ]
        })

        try {
            
        } catch (error) {
            console.error("Error at Booking: ", err);
            res.status(500).json({ error: "Internal Server Error"});
        }
    }
}