import { User } from "../business/User.js";
export class UserService {
    /**
     * @constructor
     * 
     * @param {express.Application} app
     */
    constructor(app) {
        this.app = app;

        // Define all routes for user operations
        this.app.post('/user', this.createUser);
        this.app.get('/user/:id', this.getUserById);
        this.app.get('/users', this.getUsers);
        this.app.put('/user/:id', this.updateUser);
    }

    /**
    * Create a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @returns {Promise<void>}
    */
    async createUser(req, res) {
        try {
            // Use data from the request body and authenticated user
            const { firstName, lastName, email, phoneNum, gender, title, profilePic, password, inviteLink = null } = req.body;

            // Create the user
            const newUser = new User(nulll, firstName, lastName, email, phoneNum, gender, title, profilePic, null, null, password);

            // Save user to the database
            await newUser.save(inviteLink);

            // Respond with the created event ID
            res.status(201).json({ message: "User created successfully" });
        } catch (err) {
            console.error("Error creating user:", err);
            res.status(500).json({ error: "Unable to create user." });
        }
    }

    /** @type {express.RequestHandler} */
    async updateUser(req, res) {
        try {
            const { firstName, lastName, email, phoneNum, gender, title, profilePic, password = null } = req.body;
            const userId = req.params.id

            // Retrieve the Organization by ID
            const user = await User.getUserById(userId);
            if (!user) { return res.status(404).json({ message: "User not found" }); }

            // Update User Object fields
            user.firstName = firstName;
            user.lastName = lastName;
            user.email = email;
            user.phoneNum = phoneNum;
            user.gender = gender;
            user.title = title;
            user.profilePic = profilePic;
            user.hashedPass = password ? await User.hashPass(password) : user.hashedPass;

            // Update User in DB
            const updatedUser = await user.save();
            if (updatedUser) {
                res.status(200).json({ message: "User updated successfully" });
            }
            else { res.status(500).json({ error: "Unable to update User." }); }
        } catch (err) {
            console.error("Error at Update User:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    async getUserById(req, res) {
        try {
            const userId = req.params.id;
            const user = await User.GetUserById(userId);
            if (user) {
                res.status(200).json(user);
            } else {
                res.status(404).json({ message: "User not found" });
            }
        } catch (err) {
            console.error("Error getting user:", err);
            res.status(500).json({ error: "Unable to get user." });
        }
    }

    /** @type {express.RequestHandler} */
    async getUsers(req, res) {
        try {
            const users = await User.GetAllUsers();
            if (users.length > 0) {
                res.status(200).json(users);
            } else {
                res.status(404).json({ message: "Users not found" });
            }
        } catch (err) {
            console.error("Error getting all Users:", err);
            res.status(500).json({ error: "Unable to get Users." });
        }
    }

}