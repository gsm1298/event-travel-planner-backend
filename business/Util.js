export class Util {
    static async gen_token() {
        var formData = new URLSearchParams();
        formData.append('client_id', '3D0Z9FuwA0PftIzpm7BskjDPodD1LdXl'),
        formData.append('client_secret', 'cU8Nbf9H15J4fGRv'),
        formData.append('grant_type', 'client_credentials')

        var resp = await fetch ('https://test.api.amadeus.com/v1/security/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        })

        return resp.json();
    }
}