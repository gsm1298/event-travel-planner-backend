import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import ejs from 'ejs';
import { Duffel } from '@duffel/api';
import { User } from '../business/User.js';
import { Flight } from '../business/Flight.js';
import { Util } from '../business/Util.js';
import Joi from 'joi';
import { logger } from '../service/LogService.mjs';
import Amadeus from 'amadeus';
import { Email } from '../business/Email.js';
import { Event } from '../business/Event.js';
import { AuthService } from './AuthService.js';

// Init child logger instance
const log = logger.child({
    service: "flightService", //specify module where logs are from

});

//Initialize env config and load in env for appropriate modules
dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

const duffel = new Duffel({
    token: `${process.env.duffelToken}`
})

const amadeus = new Amadeus({
    clientId: `${process.env.amadeusToken}`,
    clientSecret: `${process.env.amadeusSecret}`
})

// Flight Service Class
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

        app.get('/flights/bookedflight/:id', this.getBookedFlight);
    }


    // Endpoints -----------------------------------------------------------------

    // Search for Flight
    /**@type {express.RequestHandler} */
    async search(req, res) {

        // Check if the user is an attendee
        if (!AuthService.authorizer(req, res, ["Attendee"])) {
            log.verbose("unauthorized user attempted to search for a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }

        // Init some variables
        var input = req.body;
        var origin_airport;

        // JOI Validation
        const schema = Joi.object({
            lat: Joi.number().unsafe().required(),
            long: Joi.number().unsafe().required(),
            departure_date: Joi.string().isoDate().required(),
            return_date: Joi.string().isoDate().optional(),
            destination: Joi.string().required(),
            type: Joi.number().required()
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        // Call to Amadeus to return list of closest airport codes
        // Accepts in a longitude and latitude value provided by Google Places API from Front
        try {
            await amadeus.referenceData.locations.airports.get({
                latitude: input.lat, longitude: input.long
            }).then(resp => {
                origin_airport = resp.data[0].iataCode;
            })
        } catch (err) {
            log.error("Error at Flight Search", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        // Instantiate vars before the try/catch block for scoping
        var offers;
        var data = [];

        try {
            // Generate offer search and call Duffel api
            // Generate one-way or round trip based on input type value
            if (input.type == 0) {
                await duffel.offerRequests.create({
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
                }).then(resp =>
                    offers = resp
                )
            } else if (input.type == 1) {
                offers = await duffel.offerRequests.create({
                    slices: [
                        {
                            origin: origin_airport,
                            destination: input.destination,
                            departure_date: input.departure_date
                        },
                        {
                            origin: input.destination,
                            destination: origin_airport,
                            departure_date: input.return_date
                        }
                    ],
                    passengers: [
                        {
                            type: "adult"
                        }
                    ],
                    cabin_class: "economy"
                }).then(resp =>
                    offers = resp
                )
            } else {
                throw new Error("Invalid Flight Type!");
            }


            // Parse through api data and store necessary info to data
            offers.data.offers.forEach((o) => {
                if (o.payment_requirements.payment_required_by == null) {
                    return;
                }

                // Init empty array to hold parsed slice data
                var slices = []

                // Call Utils to parse
                o.slices.forEach((s) => slices.push(Util.parseSlice(s)));

                // Format Duffel data
                data.push({
                    offer_id: o.id,
                    passenger_id: o.passengers[0].id,
                    airline: o.owner.name,
                    price: o.total_amount,
                    duration: o.slices[0].duration,
                    destination_airport: o.slices[0].destination.iata_code,
                    origin_airport: o.slices[0].origin.iata_code,
                    logo: o.owner.logo_symbol_url,
                    flight_class: o.slices[0].fare_brand_name,
                    flight_type: slices[0].flight_type,
                    details: slices
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
        // Check if the user is an attendee
        if (!AuthService.authorizer(req, res, ["Attendee"])) {
            log.verbose("unauthorized user attempted to hold a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }

        var input = req.body;
        var user;
        var attendee_id;

        // JOI Validation
        const schema = Joi.object({
            offerID: Joi.string().required(),
            passID: Joi.string().required(),
            flight: Joi.object().required(),
            eventID: Joi.number().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        try {
            user = await User.GetUserById(res.locals.user.id);
            if (user) {
                attendee_id = await User.GetAttendee(input.eventID, user.id);
                if (!attendee_id) {
                    return res.status(403).json({ error: "User not an attendee" });
                } else{
                    const event = await Event.findById(input.eventID);

                    // Check if event hases ended
                    if (event.CheckIfEventIsOver()) {
                        return res.status(403).json({ error: "Event has already ended" });
                    }
                }
            } else { return res.status(404).json({ error: "User not found" }); }
        } catch (error) {
            log.error("uncaught user get request from flightservice");
            return res.status(500).json({ error: "Internal Server Error" });
        }

        // Check if user already has a flight on hold
        const existingFlight = await Flight.getBookedFlight(input.eventID, user.id);

        if (existingFlight.status == 1) {
            log.verbose("user already has a flight on hold", { email: user.email, eventID: input.eventID });
            return res.status(400).json({ error: "Flight already on hold" });
        } else if (existingFlight.status == 3) {
            log.verbose("user already has a flight booked", { email: user.email, eventID: input.eventID });
            return res.status(400).json({ error: "Flight already booked" });
        }

        try{
            // Create hold on given flight offer
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

            // Formatted response data from Duffel
            var data = {
                id: confirmation.data.id,
                offer_id: confirmation.data.offer_id,
                totalPrice: confirmation.data.total_amount,
                expiration: confirmation.data.payment_status.payment_required_by,
                guarantee: confirmation.data.payment_status.price_guarantee_expires_at,
                slices: confirmation.data.slices,
                deptSlice: confirmation.data.slices[0],
                airline: confirmation.data.owner.name,
                airlineLogo: confirmation.data.owner.logo_symbol_url,
                airlineLogoLockup: confirmation.data.owner.logo_lockup_url
            }

            const overallDepartureTime = data.deptSlice.segments[0].departing_at;
            const overallDepartureTimeZone = data.deptSlice.segments[0].origin.time_zone;
            const overallArrivalTime = data.deptSlice.segments[data.deptSlice.segments.length - 1].arriving_at;
            const overallArrivalTimeZone = data.deptSlice.segments[data.deptSlice.segments.length - 1].destination.time_zone;
            const overallDepartureAirportCode = data.deptSlice.origin.iata_code;
            const overallArrivalAirportCode = data.deptSlice.destination.iata_code;
            const overallDuration = data.deptSlice.duration;

            // Init empty array to hold parsed slice data
            const slices = []

            // Call Utils to parse
            data.slices.forEach((s) => slices.push(Util.parseSlice(s)));

            const dbItinerary = {
              price: data.totalPrice,
              airline: data.airline,
              logoURL: data.airlineLogo,
              offer_id: data.offer_id,
              itinerary: slices
            }
            //console.log(JSON.stringify(dbItinerary))

            // Insert new hold into DB
            var newHold = new Flight(null, attendee_id, data.totalPrice, overallDepartureTime, 
            overallDepartureAirportCode, overallArrivalTime, overallArrivalAirportCode, 1, 
            null, null, null, null, null, data.id, JSON.stringify(dbItinerary));
            newHold.save();

            const templatePath = path.join(process.cwd(), 'email_templates', 'flightHoldEmail.ejs');
            // Prepare data to pass into template
            const templateData = {
              user: {
                firstName: user.firstName
              },
              flight: {
                depart_loc: overallDepartureAirportCode,
                depart_time: new Date(overallDepartureTime).toLocaleDateString('en-US', {
                  timeZone: overallDepartureTimeZone,
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                  timeZoneName: 'short'
                }),
                arrive_loc: overallArrivalAirportCode,
                arrive_time: new Date(overallArrivalTime).toLocaleDateString('en-US', {
                  timeZone: overallArrivalTimeZone,
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                  timeZoneName: 'short'
                }),
                price: data.totalPrice,
                duration: overallDuration.replace('P', '').replace('D', 'd ').replace('T', '').replace('H', 'h ').replace('M', 'm'),
                airlineLogo: data.airlineLogoLockup
              }
            };

            let htmlContent;
            try {
              htmlContent = await ejs.renderFile(templatePath, templateData);
            } catch (renderErr) {
              log.error("Error rendering email template:", renderErr);
            }

            // Use generated htmlContent to send email
            const email = new Email(
              'no-reply@jlabupch.uk',
              user.email,
              "Flight on Hold",
              null,
              htmlContent
            );
            email.sendEmail();

            log.verbose("user flight hold confirmed", { email: user.email, confirmationID: confirmation.data.id });
            res.status(200).send(JSON.stringify(data));

        } catch (error) {
            log.error("Error at Booking: ", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Book Flight
    /**@type {express.RequestHandler} */
    async booking(req, res) {

        // Check if the user is a finance Manager
        if (!AuthService.authorizer(req, res, ["Finance Manager"])) {
            log.verbose("unauthorized user attempted to book a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }
        
        const schema = Joi.object({
            id: Joi.number().required(),
            price: Joi.number().positive().required(),
            eventID: Joi.number().required(),
            selection: Joi.boolean().required()
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        var input = req.body;

        try {
            const event = await Event.findById(input.eventID);

            // Check if event is over
            if (event.CheckIfEventIsOver()) {
                log.verbose("event is already over", { eventId: event.id });
                return res.status(400).json({ message: "Event is already over" });
            }
            var flight = await Flight.getFlightByID(input.id);
            if (!flight) {
                return res.status(404).json({ error: "Flight not found" });
            }

            // UNCOMMENT TO ENABLE PAYMENT THROUGH DUFFLE
            // Payment Creation 
            // var confirmation = await duffel.payments.create({
            //     'order_id': input.id,
            //     'payment': {
            //         'type': 'balance',
            //         'amount': input.price,
            //         'currency': 'USD'
            //     }
            // })

            const oldFilghtStatus = flight.status;

            // Update DB record
            if(input.selection) {
                flight.status = 3;
                flight.confirmation_code = "Confirmed";
            } else {
                flight.status = 2
                flight.confirmation_code = "Denied";
            }
            flight.approved_by = res.locals.user.id;
            flight.save();

            // Check if flight was set to approved from pending
            if (flight.status == 3 && oldFilghtStatus == 1) {
                // Updated the event history if flight was approved
                await event.updateEventHistory(res.locals.user.id, flight.flight_id);
            }

            

             // Get Flight Attendee Info
             var client = await User.GetUserByAttendee(flight.attendee_id);

            // Send email to user
            const email = new Email('no-reply@jlabupch.uk', client.email, "Flight Booked", `Your flight from ${flight.depart_loc} to ${flight.arrive_loc} has been booked.`);
            email.sendEmail();

            res.status(200).json({ success: 'Flight Booked' });
            log.verbose("flight booked", { flightID: flight.flight_id });

        } catch (error) {
            log.error("Error at Booking: ", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Get all Flights for input Event
    // For Finance Use
    /**@type {express.RequestHandler} */
    async getEventFlights(req, res) {
        log.verbose("getEventFlights", { flightID: req.params.id });

        try {
            const eventID = req.params.id;
            const flights = await Flight.getFlightsByEvent(eventID);
            if (flights) {
                res.status(200).json(flights);
            } else {
                res.status(400).json({ message: "Flights not found" });
            }
        } catch (error) {
            log.error("Error retrieving flights for event:", error);
            res.status(500).json({ error: "Unable to fetch flights" });
        }
    }

    // Get booked flight for user given input Event and User
    // For Attendee
    /**@type {express.RequestHandler} */
    async getBookedFlight(req, res) {
        try {
            const eventID = req.params.id;
            const flight = await Flight.getBookedFlight(eventID, res.locals.user.id);
            if(flight) {
                res.status(200).json(flight);
            } else {
                res.status(404).json({message: "No Booking Found"});
            }
        } catch (error) {
            log.error("Error retrieving booked flight for user:", error);
            res.status(500).json({ error: "Unable to fetch flight" });
        }
    }
}