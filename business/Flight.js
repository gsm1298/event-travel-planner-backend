import { FlightDB } from "../data_access/FlightDB.js";
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    business : "flight", //specify module where logs are from
});

/**
 * @Class Flight
 */
export class Flight {
    /**
     * @constructor
     * @param {Integer} flight_id,
     * @param {Integer} attendee_id,
     * @param {Float} price,
     * @param {Datetime} depart_time,
     * @param {String} depart_loc,
     * @param {Datetime} arrive_time,
     * @param {String} arrive_loc,
     * @param {Object} status,
     * @param {Integer} approved_by,
     * @param {Integer} seat_num,
     * @param {String} seat_letter,
     * @param {String} confirmation_code,
     * @param {String} flight_number,
     * @param {String} order_id,
     * @param {Object} itinerary
     */
    constructor(
        flight_id = null, attendee_id = null, price = null, depart_time = null,
        depart_loc = null, arrive_time = null, arrive_loc = null, status = null, approved_by = null,
        seat_num = null, confirmation_code = null, flight_number = null, 
        order_id = null, itinerary = null, owner = null
    ){
        this.flight_id = flight_id,
        this.attendee_id = attendee_id,
        this.price = price,
        this.depart_time = depart_time,
        this.depart_loc = depart_loc,
        this.arrive_time = arrive_time,
        this.arrive_loc = arrive_loc,
        this.status = status,
        this.approved_by = approved_by,
        this.seat_num = seat_num,
        this.confirmation_code = confirmation_code,
        this.flight_number = flight_number,
        this.order_id = order_id,
        this.itinerary = itinerary,
        this.owner = owner
    }

    /**
     * Insert Flight (Create/Update)
     * @returns {Promise<Integer>}
     * @throws {Error} 
     */
    async save() {
        const db = new FlightDB();
        try {
            if(this.flight_id) {
                const current = await db.getFlight(this.flight_id);

                for(var prop in this) {
                    if(this[prop] == null) {
                        this[prop] = current[prop];
                    }
                }
                
                const ret = await db.updateFlight(this);
                return ret ? this.id : null;
            } else {
                const id = await db.createFlight(this);
                return id;
            }
        } catch (error) {
            log.error(error);
            log.error(newError("Error attempting to insert/save event"));
        }

    }

    /**
     * Get all Flights by Event ID
     * @param {Integer} eventID
     * @returns {Promise<Flight[]>}
     * @throws {Error}
     */
    static async getFlightsByEvent(eventID) {
        const db = new FlightDB();
        try {
            return await db.getAllFlightsForEvent(eventID);
        } catch(error) {
            log.error(error);
            log.error(newError("Error grabbing flights by event ID"));
        } finally {
            db.close();
        }
    }

    /**
     * Get Flight By ID
     * @param {Integer} flightID
     *  @returns {Promise<Flight>} Flight OBJ
     * @throws {Error}
     */
    static async getFlightByID(flightID) {
        log.verbose("flight called by ID", {flightId: flightID});
        const db = new FlightDB();
        try {
            return await db.getFlight(flightID)
        } catch (error) {
            throw new Error("Error grabbing flight");
        } finally {
            db.close();
        }
    }

    /**
     * Get Booked Flight for User 
     * @param {Integer} eventID
     * @param {Integer} userID 
     * @returns {Promise<Flight>} Flight OBJ
     * @throws {Error}
     */
    static async getBookedFlight(eventID, userID) {
        const db = new FlightDB();
        try {
            return await db.getBookedFlight(eventID, userID);
        } catch (error) {
            throw new Error("Error grabbing flight");
        } finally {
            db.close();
        }
    }
}