import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { Duffel } from '@duffel/api';
import zipcodes from 'zipcodes';
import { User } from '../business/User.js';
import { Flight } from '../business/Flight.js';

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

        app.get('/flights/eventflights', this.getEventFlights);
    }

    /**@type {express.RequestHandler} */
    async search(req, res) {
        var input = req.body;

        try {
            // Temp validation
            if (input.destination.length != 3) {
                return res.status(400).json({ error: "Invalid Flight Origin and/or Destination" });
            };

            // Lookup client zip and get coords for Duffel call
            var client_coords = zipcodes.lookup(input.zip);

            // Call to Duffel to return list of closest airport codes
            var closest_airports = async () => {
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
        } catch (err) {
            console.error("Error at Flight Search:  ", err);
            return res.status(500).json({ error: "Internal server error" });
        }


        // Instantiate offers before the try/catch block for scoping
        var offers;

        try {
            // Generate offer search and call Duffel api
            offers = await duffel.offerRequests.create({
                slices: [
                    {
                        origin: 'ROC', // Defaulting origin to closest city
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
                // if(o.payment_requirements.payment_required_by == null) {
                //     return;
                // }
                
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
                console.log(itinerary);
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
                    stop_count: stops,
                    flight_type: stops == 1 ? "Nonstop" : "Connecting",
                    flight_class: o.slices[0].fare_brand_name,
                    itinerary: itinerary
                })
            });

            res.status(200).send(JSON.stringify(data));
        } catch (err) {
            console.error("Error at Offer Search:  ", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    /**@type {express.RequestHandler} */
    async hold(req, res) {
        var input = req.body;

        try {
            var user = await User.GetUserById(res.locals.user.id);
        } catch (error) {
            res.status(500).json({error: "Internal Server Error"});
        }

        try {
            var confirmation = await duffel.orders.create({
                selected_offers: [input.offerID],
                type: "hold",
                passengers: [
                    {
                        id: input.passID,
                        given_name: "Test",
                        family_name: "User",
                        title: "mr",
                        gender: "m",
                        phone_number: "+15856018989",
                        email: "test@test.com",
                        born_on: "1990-01-01"
                    }
                ]
            })

            var data = {
                offer_id: confirmation.offer_id,
                total: confirmation.total_amount,
                expiration: confirmation.data.payment_status.payment_required_by
            }

            res.status(200).send(JSON.stringify(data));

        } catch (error) {
            console.error("Error at Booking: ", error);
            return res.status(500).json({ error: "Internal Server Error" });
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
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    /**@type {express.RequestHandler} */
    async getEventFlights(req, res) {
        try {
            const eventID = req.body.id;
            const flights = await Flight.getFlightsByEvent(1);
            if(flights) {
                res.status(200).json(flights);
            } else {
                res.status(400).json({message: "Flights not found"});
            }
        } catch (error) {
            console.error("Error retrieving flights for event:", error);
            res.status(500).json({ error: "Unable to fetch flights"});
        }
    }
}