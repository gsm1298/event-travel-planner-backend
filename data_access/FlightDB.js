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
        flight.depart_loc, flight.arrive_time. flight.arrive_loc, flight.status,
        flight.approved_by, flight.seat_num, flight.seat_letter, flight.confirmation_code,
        flight.flight_number
    FROM flight
`;

export class FlightDB extends DB {
    constructor() {
        super();
    }

    //ALL FLIGHT DB METHODS

    /**
     * Pull Flights for Event
     * @param {Integer} eventID
     * @returns {Promise<Flight[]>} Array of Flight Objects
     */
    getAllFlightsForEvent(eventID) {
        return new Promise((resolve, reject) => {
            try {
                const query = baseEventQuery +
                `
                        LEFT JOIN attendee ON flight.attendee_id = attendee.attendee_id
                    WHERE attendee.event_id = ?
                `;

                this.con.query(query, [eventID], (error, rows) => {
                    if (!err) {
                        const flights = rows.map((row) => new Flight(
                            row.flight_id,
                            row.attendee_id
                        ))
                    }
                })

            } catch(error) {
                console.error(error);
                reject(error);
            }
        })
    }
}