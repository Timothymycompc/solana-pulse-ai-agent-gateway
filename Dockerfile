FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Build the application (compiles both Vite frontend and Express backend)
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the compiled server
CMD ["npm", "run", "start"]
