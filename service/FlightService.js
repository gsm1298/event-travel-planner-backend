import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { Duffel } from '@duffel/api';
import { User } from '../business/User.js';
import { Flight } from '../business/Flight.js';
import { Util } from '../business/Util.js';
import Joi from 'joi';
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    service : "flightService", //specify module where logs are from
});

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

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

        app.get('/flights/eventflights/:id', this.getEventFlights);
    }


    // Endpoints -----------------------------------------------------------------

    // Search for Flight
    /**@type {express.RequestHandler} */
    async search(req, res) {
        var amadeus_bearer = 'czob1NpO1JsFwGkGhPBcPvtmbFdY';
        var input = req.body;
        var origin_airport;
        var list;

        // const schema = Joi.object({
        //     lat: Joi.float().required(),
        //     long: Joi.float().required(),
        //     departure_date: Joi.string().isoDate().required()
        // });

        // const { error } = schema.validate(req.body);
        // if (error) {
        //     return res.status(400).json({ error: error.details[0].message });
        // }


        try {
            // Call to Amadeus to return list of closest airport codes
            list = await fetch(`https://test.api.amadeus.com/v1/reference-data/locations/airports?latitude=${input.lat}&longitude=${input.long}`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + amadeus_bearer
                }
            })
    
            if(list.status == 401) {
                var token = await Util.gen_token();
                amadeus_bearer = token.access_token;
                list = await fetch(`https://test.api.amadeus.com/v1/reference-data/locations/airports?latitude=${input.lat}&longitude=${input.long}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + amadeus_bearer
                    }
                })
            }
            
            if (list.status == 200) {
                const parsed = await list.json();
                origin_airport = parsed.data[0].address.cityCode;
            } else {
                return res.status(401).json({ error: "Amadeus Auth Error" });
            }
        } catch (err) {
            log.error("Error at Flight Search:  ", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        // Instantiate offers before the try/catch block for scoping
        var offers;

        try {
            // Generate offer search and call Duffel api
            offers = await duffel.offerRequests.create({
                slices: [
                    {
                        origin: origin_airport,
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
                if(o.payment_requirements.payment_required_by == null) {
                    return;
                }
                
                var itinerary = [];

                o.slices[0].segments.forEach((s) => {
                    itinerary.push({
                        origin_code: s.origin.iata_code,
                        origin_name: s.origin.name,
                        destination_code: s.destination.iata_code,
                        destination_name: s.destination.name,
                        duration: (s.duration).slice(2),
                        terminal: s.origin_terminal,
                        departure_date: (s.departing_at).slice(0, 10),
                        departure_time: (s.departing_at).slice(11,16),
                        arrival_time: (s.arriving_at).slice(11,16),
                        flight_num: o.slices[0].segments[0].operating_carrier_flight_number,
                    })
                })

                var stops = o.slices[0].segments.length;

                data.push({
                    offer_id: o.id,
                    passenger_ids: o.passengers[0].id,
                    airline: o.owner.name,
                    price: o.total_amount,
                    duration: o.slices[0].duration,
                    destination_airport: o.slices[0].destination.iata_code,
                    origin_airport: o.slices[0].origin.iata_code,
                    logo: o.owner.logo_symbol_url,
                    flight_type: stops == 1 ? "Nonstop" : "Connecting",
                    flight_class: o.slices[0].fare_brand_name,
                    itinerary: itinerary
                })
            });

            res.status(200).send(JSON.stringify(data));
        } catch (err) {
            log.error("Error at Offer Search:  ", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    // Place Flight on Hold
    /**@type {express.RequestHandler} */
    async hold(req, res) {
        const schema = Joi.object({
            offerID: Joi.string().required(),
            passID: Joi.string().required()
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        var input = req.body;
        var user;

        try {
            user = await User.GetUserById(res.locals.user.id);
        } catch (error) {
            log.error("uncaught user get request from flightservice");
            res.status(500).json({error: "Internal Server Error"});
        }

        try {
            var confirmation = await duffel.orders.create({
                selected_offers: [input.offerID],
                type: "hold",
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
                id: confirmation.id,
                offer_id: confirmation.offer_id,
                total: confirmation.total_amount,
                expiration: confirmation.payment_status.payment_required_by,
                guarantee: confirmation.payment_status.price_guarantee_expires_at
            }

            var newHold = Flight(null, res.locals.user.id, flight.price, flight.depart_time, 
            flight.depart_loc, flight.arrive_time, flight.arrive_loc, flight.status, 
            flight.approved_by, flight.seat_num, flight.confirmation_code, flight.flight_number, 
            data.id);
            newHold.save();

            res.status(200).send(JSON.stringify(data));
            log.verbose("user flight hold confirmed", { email: user.email, confirmationID: confirmation.data.id });

        } catch (error) {
            log.error("Error at Booking: ", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Book Flight
    /**@type {express.RequestHandler} */
    async booking(req, res) {
        const schema = Joi.object({
            id: Joi.string().required(),
            price: Joi.number().positive().required()
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        var input = req.body;

        try {
            var flight = await Flight.getFlight(input.flightID);
            if(!flight) {
                return res.status(404).json({ error: "Flight not found" });
            }

            // Payment Creation

            // var confirmation = await duffel.payments.create({
            //     'order_id': input.id,
            //     'payment': {
            //         'type': 'balance',
            //         'amount': input.price,
            //         'currency': 'USD'
            //     }
            // })

            flight.status = 2; // Need to double check
            flight.save();

            res.status(200).json({ success: 'Flight Booked' });
            log.verbose("flight booked", { confirmation: confirmation });

        } catch (error) {
            log.error("Error at Booking: ", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Get all Flights for input Event
    // For Finance Use
    /**@type {express.RequestHandler} */
    async getEventFlights(req, res) {
        try {
            const eventID = req.params.id;
            const flights = await Flight.getFlightsByEvent(eventID);
            if(flights) {
                res.status(200).json(flights);
            } else {
                res.status(400).json({ message: "Flights not found" });
            }
        } catch (error) {
            log.error("Error retrieving flights for event:", error);
            res.status(500).json({ error: "Unable to fetch flights" });
        }
    }
}