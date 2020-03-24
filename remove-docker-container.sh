#!/bin/bash
(docker stop elliot-geolocation || echo \"El contenedor elliot-geolocation no está ejecutándose\") && 
(docker container rm elliot-geolocation || echo \"El contenedor elliot-geolocation no existe\") && 
(docker image rm elliot-geolocation || echo \"La imagen elliot-geolocation no existe\")