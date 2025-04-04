export class Util {
    static parseSlice(slice) {
        var stops = [];

        slice.segments.forEach(s => {
            stops.push({
                origin: s.origin.iata_code,
                origin_name: s.origin.name,
                destination: s.destination.iata_code,
                destination_name: s.destination.name,
                duration: (s.duration).slice(2),
                terminal: s.origin_terminal,
                departure_date: (s.departing_at).slice(0, 10),
                departure_time: (s.departing_at).slice(11,16),
                arrival_time: (s.arriving_at).slice(11,16),
                flight_num: s.operating_carrier_flight_number,
                carrier: s.operating_carrier.name
            })
        })

        return {
            class: slice.fare_brand_name,
            duration: slice.duration,
            origin: slice.origin.iata_code,
            destination: slice.destination.iata_code,
            flight_type: stops.length == 1 ? "Non-Stop"  : "Connecting",
            itinerary: stops
        }
    }
}