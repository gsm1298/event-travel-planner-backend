export class Util {
    static parseSlice(slice) {
        var stops = [];

        slice.segments.forEach(s => {
            stops.push({
                origin: s.origin.iata_code,
                origin_name: s.origin.name,
                origin_city: s.origin.city_name,
                origin_TZ: s.origin.time_zone,
                destination: s.destination.iata_code,
                destination_name: s.destination.name,
                destination_city: s.destination.city_name,
                destination_TZ: s.destination.time_zone,
                duration: s.duration,
                terminal: s.origin_terminal,
                departure_date: (s.departing_at).slice(0, 10),
                departure_time: (s.departing_at).slice(11,16),
                arrival_time: (s.arriving_at).slice(11,16),
                flight_num: s.operating_carrier_flight_number,
                carrier: s.operating_carrier.name,
                class: slice.fare_brand_name
            })
        })

        return {
            class: slice.fare_brand_name,
            duration: slice.duration,
            origin: slice.origin.iata_code,
            destination: slice.destination.iata_code,
            flight_type: stops.length == 1 ? "Non-Stop"  : stops.length == 2 ? "1 Stop" : `${stops.length + 1} Stops`,
            departure_time: slice.segments[0].departing_at,
            arrival_time: slice.segments[(slice.segments.length - 1)].arriving_at,
            itinerary: stops
        }
    }
}