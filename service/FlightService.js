import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
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
        
        app.get('/flights/seats/:id', this.getSeatMap);
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

            var search_key = offers.data.client_key;

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
                    details: slices,
                    search_key: search_key
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
        } catch (error) {
            log.error("uncaught user get request from flightservice");
            res.status(500).json({ error: "Internal Server Error" });
        }

        try {
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
                deptSlice: confirmation.data.slices[0]
            }

            const overallDepartureTime = data.deptSlice.segments[0].departing_at;
            const overallArrivalTime = data.deptSlice.segments[data.deptSlice.segments.length - 1].arriving_at;
            const overallDepartureAirportCode = data.deptSlice.origin.iata_code;
            const overallArrivalAirportCode = data.deptSlice.destination.iata_code;
            
            var attendee_id = await User.GetAttendee(input.eventID, res.locals.user.id);

            // Insert new hold into DB
            var newHold = new Flight(null, attendee_id, data.totalPrice, overallDepartureTime, 
            overallDepartureAirportCode, overallArrivalTime, overallArrivalAirportCode, 1, 
            null, null, null, null, data.id, input.flight.details);
            newHold.save();

            // Notify user via email
            const email = new Email(
                'no-reply@jlabupch.uk',
                user.email,
                "Flight on Hold", null,
                `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flight on Hold</title>
</head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5; padding:20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color:#4c365d; padding:40px 20px;">
              <h1 style="color:#ffffff; margin:0; font-size:28px;">Flight on Hold</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:30px 20px; background-color:#FFFFE2; text-align:left;">
              <p style="font-size:18px; color:#333333; margin:0 0 20px;">Dear ${user.firstName},</p>
              <p style="font-size:16px; color:#333333; margin:0 0 30px;">
                Your flight has been placed on hold. Please review the details below:
              </p>

              <!-- Flight Details Card with Rounded Border -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border:2px solid #4c365d; border-radius:8px; background-color:#ffffff; padding:20px; overflow:hidden;">
                <tr>
                  <!-- Departure Column -->
                  <td width="33%" valign="middle" style="text-align:center; padding:10px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center">
                          <h2 style="color:#4c365d; margin:0; font-size:20px;">Departure</h2>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top:5px;">
                          <p style="font-size:16px; color:#333333; margin:0;">
                            <strong>${input.flight.depart_loc}</strong>
                          </p>
                          <p style="font-size:14px; color:#666666; margin:3px 0 0;">
                            ${input.flight.depart_time}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Plane Icon Column -->
                  <td width="33%" valign="middle" style="text-align:center; padding:10px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center">
                          <!-- Plane Icon -->
                          <span style="font-size:30px; color:#4c365d; line-height:1;">&#9992;</span>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Arrival Column -->
                  <td width="33%" valign="middle" style="text-align:center; padding:10px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center">
                          <h2 style="color:#4c365d; margin:0; font-size:20px;">Arrival</h2>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top:5px;">
                          <p style="font-size:16px; color:#333333; margin:0;">
                            <strong>${input.flight.arrive_loc}</strong>
                          </p>
                          <p style="font-size:14px; color:#666666; margin:3px 0 0;">
                            ${input.flight.arrive_time}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Date Row -->
                <tr>
                  <td colspan="3" style="padding-top:20px; text-align:center;">
                    <p style="font-size:16px; color:#333333; margin:0;">
                      <strong>Date:</strong> ${input.flight.date}
                    </p>
                  </td>
                </tr>

                <!-- Price Row -->
                <tr>
                  <td colspan="3" style="padding-top:10px; text-align:center;">
                    <p style="font-size:16px; color:#333333; margin:0;">
                      <strong>Price:</strong> $${input.flight.price}
                    </p>
                  </td>
                </tr>
              </table>
              <!-- End Flight Details Card -->

              <p style="font-size:16px; color:#666666; margin:30px 0 0;">
                Thank you for using our service!
              </p>
              <p style="font-size:16px; color:#666666; margin:10px 0 0;">
                Best regards,
              </p>
              <p style="font-size:16px; color:#666666; margin:0;">
                The Event Travel Planner Team
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color:#f0f0f0; padding:20px;">
              <p style="font-size:14px; color:#888888; margin:0;">
                If you have any questions, feel free to contact your organization's event planning team.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
            );
            await email.sendEmail();

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

        // Check if the user is a finance Manager
        if (!AuthService.authorizer(req, res, ["Finance Manager"])) {
            log.verbose("unauthorized user attempted to book a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }
        
        const schema = Joi.object({
            id: Joi.string().required(),
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
            var flight = await Flight.getFlightByID(input.flightID);
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
            if(input.selection == 1) {
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
                const event = await Event.findById(input.eventID);
                await event.updateEventHistory(res.locals.user.id, flight.flight_id);
            }
            
            // Get Flight Attendee Info
            var client = User.GetUserByAttendee(flight.attendee_id);

            // Send email to user
            const email = new Email('no-reply@jlabupch.uk', client.email, "Flight Booked", `Your flight to ${flight.destination_airport} has been booked.`);
            await email.sendEmail();

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

    // Retrieve Seat Map for ID
    /**@type {express.RequestHandler} */
    async getSeatMap(req, res) {
      try {
        const offer = req.params.id;
        const seats = await duffel.seatMaps.get({
          offer_id: offer
        })

        res.status(200).json(seats) 
      } catch (error) {
          log.error("Error retrieving seat map", error);
          res.status(500).json({ error: "Unable to fetch seat map" });
      }
    }
}