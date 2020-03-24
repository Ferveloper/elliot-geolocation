var express = require('express');
var router = express.Router();
const axios = require('axios');

const {
  ORION_HOST,
  ORION_PORT,
  IOTAGENT_HOST,
  IOTAGENT_NORTH_PORT,
  IOTAGENT_SOUTH_PORT,
  API_KEY,
  QUANTUMLEAP_HOST,
  QUANTUMLEAP_PORT,
  SERVICE,
  SERVICEPATH
} = process.env;

const servicesUrl = `http://${IOTAGENT_HOST}:${IOTAGENT_NORTH_PORT}/iot/services`;
const devicesUrl = `http://${IOTAGENT_HOST}:${IOTAGENT_NORTH_PORT}/iot/devices`;
const subscriptionsUrl = `http://${ORION_HOST}:${ORION_PORT}/v2/subscriptions`;
const updateUrl = `http://${IOTAGENT_HOST}:${IOTAGENT_SOUTH_PORT}/iot/json?k=${API_KEY}`;
const entityTypes = {
  Mobile: {
    attrs: [
      // 'health_status', 
      'latitude', 
      'longitude']
  }
};
const headers = {
  'Accept': 'application/json',
  'fiware-service': SERVICE,
  'fiware-ServicePath': SERVICEPATH
};
const services = (entityType) => {
  return {
    services: [
      {
        apikey: API_KEY,
        cbroker: `http://${ORION_HOST}:${ORION_PORT}`,
        entity_type: entityType,
        resource: '/iot/json'
      }
    ]
  }
};
const devices = (newDeviceId, entityType, id) => {
  return {
    devices: [
      {
        device_id: newDeviceId,
        entity_name: `urn-ngsi:${entityType}:${newDeviceId}`,
        entity_type: entityType,
        protocol: 'PDI-IoTA-JSON',
        transport: 'HTTP',
        attributes: [
          // { object_id: "hs", name: "health_status", type: "String" },
          { object_id: "lat", name: "latitude", type: "Float" },
          { object_id: "lon", name: "longitude", type: "Float" }
        ],
        static_attributes: [
          { name: "received_id", type: "String", value: id },
        ]
      }
    ]
  }
};
const subscription = (entityType) => {
  return {
    description: `Notify updates from ${entityType} devices`,
    notification: {
      attrs: entityTypes[entityType].attrs,
      http: {
        url: `http://${QUANTUMLEAP_HOST}:${QUANTUMLEAP_PORT}/v2/notify`
      }
    },
    subject: {
      condition: {
        attrs: entityTypes[entityType].attrs
      },
      entities: [
        {
          idPattern: `^${entityType}\d+`,
          type: entityType
        }
      ]
    },
    throttling: 1
  }
};

// Register an user
router.post('/devices', async function (req, res, next) {

  try {
    let device = req.body;
    console.log("Petición recibida: ", req.body)
    let missingProperties = [
      // 'id', 
      'latitude', 
      'longitude', 
      // 'entityType'
    ].filter(key => !device[key]);
    if (missingProperties.length > 0) {
      throw {
        success: false,
        status: 422,
        message: `Missing properties: ${missingProperties.toString().replace(/,/g, ', ')}`
      }
    };
    // if (!['Mobile'].includes(req.body.entityType)) {
    //   throw {
    //     success: false,
    //     status: 422,
    //     message: 'entity_type field must be set to Mobile'
    //   }
    // }

    if (!device.id) device.id = 'anonymous';
    device.entityType = 'Mobile';

    // Create service group
    // Get existing services groups
    const servicesRes = await axios.get(servicesUrl, { headers });
    const servicesData = servicesRes.data.services;
    // console.log("services", servicesData);

    // If there is no service group available for this entity type, one is created
    if (servicesData.filter(service => service.entity_type === device.entityType).length === 0) {
      const postService = await axios.post(servicesUrl, services(device.entityType) , { headers });
      console.log('Servicio creado:', postService.status, postService.statusText);
    } else {
      console.log(`Ya existe un servicio para la entidad ${device.entityType}`);
    };

    // Create device
    // Get existing devices
    const devicesRes = await axios.get(devicesUrl, { headers });
    const devicesData = devicesRes.data.devices;
    // console.log("devices", devicesData)

    let lastDeviceId, deviceNumber, newDeviceId;
    if (devicesData.length !== 0) {
      function pad(n, width, z) {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
      }
      lastDeviceId = devicesData[devicesData.length - 1].device_id; // Get last device ID: e.g. 'Mobile001'
      deviceNumber = parseInt(lastDeviceId.match(/\d+$/));      // Get ID last digit: e.g. 'Mobile001' --> '001' --> 1
      newDeviceId = lastDeviceId.replace(/\d+$/, pad((deviceNumber + 1), 8).toString()) // Define new device ID by increasing device number and padding with zeroes if needed: e.g. 'Mobile002'
    } else {
      newDeviceId = 'Mobile00000001' // Define initial device ID if none is present
    };

    console.log("Nueva ID generada:", newDeviceId);

    const postDevice = await axios.post(devicesUrl, devices(newDeviceId, device.entityType, device.id), { headers });
    console.log('Dispositivo creado:', postDevice.status, postDevice.statusText);

    const updateDevice = await axios.post(`${updateUrl}&i=${newDeviceId}`, {
      lat: parseFloat(device.latitude),
      lon: parseFloat(device.longitude)
    }, { headers });
    console.log('Dispositivo actualizado:', updateDevice.status, updateDevice.statusText);

    // Create subscription
    // Get existing subcriptions
    const subscriptionsRes = await axios.get(subscriptionsUrl, { headers });
    const subscriptions = subscriptionsRes.data;
    // console.log("subscriptions", subscriptions);

    // If there is no subscription available for this entity type, one is created
    if (subscriptions.filter(subscription => subscription.subject.entities[0].type === device.entityType).length === 0) {
      const postSubscription = await axios.post(subscriptionsUrl, subscription(device.entityType), { headers });
      console.log('Suscripción creada', postSubscription.status, postSubscription.statusText);
    } else {
      console.log(`Ya existe una suscripción para la entidad ${device.entityType}`);
    };

    console.log(`Proceso de alta del dispositivo ${newDeviceId} completado con éxito`)

    res.json({
      success: true,
      result: `A device was successfully created. ID: ${device.id}`
    });

  } catch (err) {
    if (err.status) {
      res.status(err.status).json(err);
    } else {
      console.log(err);
      res.status(500).json({
        success: false,
        message: 'Unknown server error'
      })
    }
  }
});

// ENDPOINT DROPPED UNTIL FURTHER NOTICE

// router.patch('/devices', async function(req, res, next) {

//   const id = req.body.id;
//   const healthStatus = req.body.health_status;
//   const latitude = req.body.latitude;
//   const longitude = req.body.longitude;

//   const devicesRes = await axios.get(devicesUrl, { headers });
//   const devicesData = devicesRes.data.devices;
//   const deviceId = devicesData.filter(device => device.static_attributes.filter(attr => attr.name === 'ID')[0].value === id)[0].device_id;

//   const updateRes = await axios.post(`http://${IOTAGENT_HOST}:${IOTAGENT_SOUTH_PORT}/iot/json?k=${API_KEY}&i=${deviceId}`, {
//     hs: healthStatus,
//     lat: latitude,
//     lon: longitude
//   });
//   console.log(updateRes.data);
//   res.json({
//     success: true,
//     message: `Device ${id} successfully updated`
//   })
// });

module.exports = router;