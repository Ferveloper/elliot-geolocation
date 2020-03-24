#!/bin/bash
docker build -t elliot-geolocation .
docker run -d -p 3000:3000 --name elliot-geolocation elliot-geolocation