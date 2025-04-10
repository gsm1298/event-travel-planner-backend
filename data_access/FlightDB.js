//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
import { Flight } from '../business/Flight.js';
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    dataAccess: "flightDb", //specify module where logs are from
});

const baseQuery =
    `
    SELECT
        flight.flight_id, flight.attendee_id, flight.price, flight.depart_time,
        flight.depart_loc, flight.arrive_time, flight.arrive_loc, 
        flight.status AS 'status_id', flightstatus.status AS 'status_name',
        flight.approved_by, flight.seat_num, flight.confirmation_code,
        flight.flight_number, flight.order_id, flight.itinerary,
        attendee.event_id,
        attendee.user_id,
        user.first_name,
        user.last_name
    FROM flight
        LEFT JOIN attendee ON flight.attendee_id = attendee.attendee_id
        LEFT JOIN flightstatus ON flight.status = flightstatus.flightstatus_id
        LEFT JOIN user ON attendee.user_id = user.user_id
`;

export class FlightDB extends DB {
    constructor() {
        super();
    }

    //ALL FLIGHT DB METHODS

    /**
     * Create Flight
     * @param {Flight} flight
     * @returns {Promise<Integer>}
     */
    createFlight(flight) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO flight (attendee_id, price, depart_time, depart_loc, arrive_time, arrive_loc, status, approved_by, seat_num, confirmation_code, flight_number, order_id, itinerary)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `;
            const params = [flight.attendee_id, flight.price, flight.depart_time, flight.depart_loc, flight.arrive_time, flight.arrive_loc, flight.status?.id, flight.approved_by, flight.seat_num, flight.confirmation_code, flight.flight_number, flight.order_id, flight.itinerary];
            this.executeQuery(query, params, "createFlight")
                .then(result => {
                    if (result.insertId > 0) {
                        log.verbose("flight created", { confirmation: flight.confirmation_code, flightPrice: flight.price, flightApprover: flight.approved_by });
                        resolve(result.insertId);
                    } else { resolve(null); }
                }).catch(error => reject(error));
        });
    }

    /**
     * Update Flight
     * @param {Flight} flight
     * @returns {Promise<Boolean>}
     */
    updateFlight(flight) {
        return new Promise((resolve, reject) => {
            const query =
                `
                UPDATE flight
                SET price = ?, depart_time = ?, depart_loc = ?, arrive_time = ?, arrive_loc = ?, status = ?,
                approved_by = ?, seat_num = ?, confirmation_code = ?, flight_number = ?, order_id = ?, itinerary = ?
                WHERE flight_id = ?;
            `
            const params = [flight.price, flight.depart_time, flight.depart_loc, flight.arrive_time,
            flight.arrive_loc, flight.status.id, flight.approved_by, flight.seat_num,
            flight.confirmation_code, flight.flight_number, flight.order_id, flight.itinerary, flight.flight_id];

            this.executeQuery(query, params, "updateFlight")
                .then(result => {
                    log.verbose("flight updated", { confirmation: flight.confirmation_code, flightPrice: flight.price, flightApprover: flight.approved_by });
                    resolve(result.affectedRows > 0);
                }).catch(error => reject(error));
        });
    }

    /**
     * Get Flight by ID
     * @param {Integer} flightID
     * @returns {Promise<Flight>} Flight OBJ
     */
    getFlight(flightID) {
        return new Promise((resolve, reject) => {
            const query = baseQuery + `WHERE flight_id = ?;`;
            this.executeQuery(query, [flightID], "getFlight")
                .then(result => {
                    if (result.length > 0) {
                        const row = result[0];
                        resolve(new Flight(
                            row.flight_id, row.attendee_id, row.price, row.depart_time,
                            row.depart_loc, row.arrive_time, row.arrive_loc, { id: row.status_id, name: row.status_name },
                            row.approved_by, row.seat_num, row.confirmation_code,
                            row.flight_number, row.order_id, row.itinerary, null
                        ));
                    } else { resolve(null); }
                }).catch(error => { reject(error); });
        });
    }

    /**
     * Get Flight for User via EventID and UserID
     * @param {Integer} eventID
     * @param {Integer} userID
     */
    getBookedFlight(eventID, userID) {
        return new Promise((resolve, reject) => {
            const query = baseQuery + `WHERE attendee.event_id = ? AND attendee.user_id = ? ORDER BY flight_id DESC LIMIT 1`;
            this.executeQuery(query, [eventID, userID], "getBookedFlight")
                .then(result => {
                    if (result.length > 0) {
                        const row = result[0];
                        resolve(new Flight(
                            row.flight_id, row.attendee_id, row.price, null,
                            null, null, null, { id: row.status_id, name: row.status_name },
                            row.approved_by, null, row.confirmation_code,
                            null, row.order_id, JSON.parse(row.itinerary), null
                        ));
                    } else { resolve(null); }
                }).catch(error => { reject(error); });
        });
    }

    /**
     * Pull Flights for Event (Financial Use)
     * @param {Integer} eventID
     * @returns {Promise<Flight[]>} Array of Flight Objects
     */
    getAllFlightsForEvent(eventID) {
        return new Promise((resolve, reject) => {
            const query = baseQuery + `WHERE attendee.event_id = ?`;
            this.executeQuery(query, [eventID], "getAllFlightsForEvent")
                .then(rows => {
                    resolve(rows.map(row => new Flight(
                        row.flight_id,
                        row.attendee_id,
                        row.price,
                        row.depart_time,
                        row.depart_loc,
                        row.arrive_time,
                        row.arrive_loc,
                        { id: row.status_id, name: row.status_name },
                        row.approved_by,
                        row.seat_num,
                        row.confirmation_code,
                        row.flight_number,
                        row.order_id,
                        row.itinerary,
                        row.first_name + " " + row.last_name
                    )));
                }).catch(error => { reject(error); });
        });
    }
}