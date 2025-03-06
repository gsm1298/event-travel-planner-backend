//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
import { Flight } from '../business/Flight.js';

const baseEventQuery =
`
    SELECT
        flight.flight_id, flight.attendee_id, flight.price, flight.depart_time,
        flight.depart_loc, flight.arrive_time, flight.arrive_loc, flight.status,
        flight.approved_by, flight.seat_num, flight.seat_letter, flight.confirmation_code,
        flight.flight_number,
        attendee.event_id,
        attendee.user_id
    FROM flight
        LEFT JOIN attendee ON flight.attendee_id = attendee.attendee_id
`;

export class FlightDB extends DB {
    constructor() {
        super();
    }

    //ALL FLIGHT DB METHODS

    /**
     * Pull Flights for Event (Financial Use)
     * @param {Integer} eventID
     * @returns {Promise<Flight[]>} Array of Flight Objects
     */
    getAllFlightsForEvent(eventID) {
        return new Promise((resolve, reject) => {
            try {
                const query = baseEventQuery +
                `
                    WHERE attendee.event_id = ?
                `;

                this.con.query(query, [eventID], (error, rows) => {
                    if (!error) {
                        const flights = rows.map((row) => new Flight(
                            row.flight_id,
                            row.attendee_id,
                            row.price,
                            row.depart_time,
                            row.depart_loc,
                            row.arrive_time,
                            row.arrive_loc,
                            row.status,
                            row.approved_by,
                            row.seat_num,
                            row.seat_letter,
                            row.confirmation_code,
                            row.flight_number
                        ));

                        resolve(flights);
                    }
                    else {
                        console.error(error);
                        reject(error);
                    }
                })

            } catch(error) {
                console.error(error);
                reject(error);
            }
        })
    }
}