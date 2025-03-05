# base image
FROM node:20 AS app

# setting working directory
WORKDIR /app


# Install pnpm globally
RUN npm i -g pnpm
# install opensll
RUN apt-get update && apt-get install -y openssl libssl-dev

# installing dependencies
COPY package.json pnpm-lock.yaml ./
# copying these folders to make sure we have prisma.schema at the time of post install
COPY prisma ./prisma

RUN pnpm i --frozen-lockfile

# copying all the files for the project
COPY . .


# build the project if in production
# RUN npm run build

# Exposing the port
EXPOSE 3000

# 
RUN npx prisma migrate

# Running the final command
CMD ["npm","run","dev"]

# for deployment use the below one

# CMD ["npm","run","start"]
