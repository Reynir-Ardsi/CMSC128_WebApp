# CMSC 128_WebApp

Online Deployment:
# https://cmsc-128-web-app.vercel.app
# Frontend: Vercel
# Backend:  Render

Collaborative To-Do List Web Application
A full-stack web application designed for managing personal tasks and collaborative projects. This application features a secure authentication system, real-time task management, and the ability to create shared groups for team collaboration.

🔗 Repository
GitHub: https://github.com/reynir-ardsi/cmsc128_webapp

🚀 Features
# User Management
Authentication: Secure Login and Registration using JWT and Bcrypt.

Password Recovery: "Forgot Password" flow utilizing security questions.

Profile Management: Update name, email, and password via a dedicated profile page.

Task Management
CRUD Operations: Create, Read, Update, and Delete tasks.

Task Details: Set due dates, times, and priority levels (Low, Mid, High).

Organization: Assign tasks to specific groups or keep them unassigned.

Sorting: Sort tasks by Date Added (Newest/Oldest), Due Date, or Priority.

Bulk Actions: Clear all completed tasks.

Collaboration & Groups
Group Types: Create Personal groups for private lists or Collaborative groups for teams.

Member Management: Search for users by email and add them as collaborators to specific groups.

Permissions: Owners can manage group members; members can leave groups.



🛠️ Tech Stack
# Frontend:

HTML5 & CSS3: Custom styling using CSS variables for theming (Dark Mode UI).

JavaScript (Vanilla): DOM manipulation, fetch API for backend communication, and local storage for token management.

# Backend:

Node.js & Express: RESTful API architecture.

MongoDB & Mongoose: NoSQL database for storing Users, Groups, and Tasks.

Authentication: jsonwebtoken for session handling and bcrypt for password hashing.

CORS: Configured for secure cross-origin resource sharing.



📂 Project Structure

├── index.html            # Landing page (Login/Register/Forgot Password)
├── todoDashboard.html    # Main application dashboard (Tasks & Groups)
├── accountProfile.html   # User profile settings
├── server.js             # Main backend server entry point
├── package.json          # Node.js dependencies and scripts
└── README.md             # Project documentation



⚙️ Installation & Setup
1. # Prerequisites
Ensure you have the following installed:

Node.js (v14 or higher)

MongoDB (Local or Atlas URI)



2. # Clone the Repository
Bash

git clone https://github.com/reynir-ardsi/cmsc128_webapp.git
cd cmsc128_webapp



3. # Install Dependencies
Navigate to the project root directory (or backend folder if separated) and run:

Bash

npm install



4. # Environment Variables
In creating a .env file in the root directory. You must configure the following keys to match the server.js configuration:
# Database Connection String
Server_Connection_Key=mongodb+srv://<username>:<password>@cluster.mongodb.net/myDatabase

# Security
JWT_SECRET=your_super_secret_key_here

# Server Port (Optional, defaults to 5000)
PORT=5000



5. # Start the Server
Run the backend server:

Bash

npm start



6. # Run the Application
Since the frontend is built with standard HTML files, you can simply open index.html in your browser.

Login/Register: Open index.html.

Dashboard: Redirects to todoDashboard.html upon login.

📡 API Endpoints
The backend exposes the following REST API endpoints:

# Authentication
    POST /auth/register - Register a new user.

    POST /auth/login - Authenticate user and receive JWT.

    POST /auth/forgot - Initiate password reset (get security question).

    POST /auth/forgot/verify - Verify security answer.

    POST /auth/forgot/reset - Reset password with token.

    GET /auth/profile - Get current user details.

    PUT /auth/profile - Update user details.

# Data & Resources
    GET /api/data - Fetch all groups and tasks for the logged-in user.

    GET /api/users/search - Search for users by name/email (for collaboration).

# Groups
    POST /api/groups - Create a new group.

    DELETE /api/groups/:id - Delete a group.

    POST /api/groups/:id/collaborators - Add a user to a collaborative group.

    DELETE /api/groups/:groupId/collaborators/:userId - Remove a collaborator.

# Tasks
    POST /api/tasks - Create a new task.

    PUT /api/tasks/:id - Update task (status, details, group).

    DELETE /api/tasks/:id - Delete a specific task.

    DELETE /api/tasks/completed - Delete all completed tasks.



🛡️ Security Notes
Token Storage: The frontend stores the JWT in localStorage.

Auth Headers: All /api/ requests require an Authorization: Bearer <token> header.

Soft Delete: Deleted tasks are moved to a temporary DeletedTask collection for 10 minutes before permanent removal.