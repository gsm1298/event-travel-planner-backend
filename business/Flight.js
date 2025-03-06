/**
 * @Class Flight
 */
export class Flight {
    /**
     * @constructor
     * @param {Integer} flight_id
     * @param {Integer} attendee_id,
     * @param {Float} price,
     * @param {Datetime} depart_time,
     * @param {String} depart_loc,
     * @param {Datetime} arrive_time,
     * @param {String} arrive_loc,
     * @param {Integer} status,
     * @param {Integer} approved_by,
     * @param {Integer} seat_num,
     * @param {String} seat_letter,
     * @param {String} confirmation_code,
     * @param {String} flight_number,
     */
    constructor(
        id = null, flight_id = null, attendee_id = null, price = null, depart_time = null,
        depart_loc = null, arrive_time = null, arrive_loc = null, status = null, approved_by = null,
        seat_num = null, seat_letter = null, confirmation_code = null, flight_number = null
    ){
        this.id = id;
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
        this.seat_letter = seat_letter,
        this.confirmation_code = confirmation_code,
        this.flight_number = flight_number
    }
}