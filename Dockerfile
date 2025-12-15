FROM node:20-slim

# Install Python 3, pip, and ffmpeg (just in case we need it later)
# We also install 'curl' to help with some yt-dlp internal requests if needed
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy project files
COPY . .

# Install Python dependencies
# We need yt-dlp and pdf2docx
RUN pip3 install yt-dlp pdf2docx --break-system-packages

# Compile TypeScript
RUN npx tsc

# Expose port (optional, mainly for health checks on some platforms)
EXPOSE 3000

# Start command
# We use node directly on the compiled file for production
CMD ["node", "dist/index.js"]
