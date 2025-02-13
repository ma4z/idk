const adminjs = require('./admin.js');
const fetch = require("node-fetch");
const newsettings = require('../handlers/readSettings').settings();

module.exports.load = async (app, db) => {
  /**
  * Information 
  * A lot of the API information is taken from Heliactyl v14 (heliactyloss).
  */

  /**
   * Checks the authorization and returns the settings if authorized.
   */
  async function checkAPI(req, res) {
    if (!newsettings.api.enabled) return res.status().send('Disabled')
    let auth = req.headers['authorization'];
    if (auth === `Bearer ${newsettings.api.code}`) return newsettings;
    
    return res.status(401).send('Unauthorized');
  }

  /**
   * GET /api
   * Returns the status of the API.
   */
  app.get("/api", checkAPI, async (req, res) => {
    res.send({ "status": true });
  });

  /**
   * GET /api/userinfo
   * Returns the user information.
   */
  app.get("/api/userinfo", async (req, res) => {
    /* Check if the API key is valid */
    let auth = await check(req, res);
    if (!auth) return;

    let userId = req.query.id;
    if (!userId) 
      return res.send({ status: "missing id" });
  
    if (!(await db.get(`users-${userId}`))) 
      return res.send({ status: "invalid id" });

    let packagename = await db.get(`package-${userId}`);
    let package = newsettings.packages.list[packagename ? packagename : newsettings.packages.default];
    if (!package) package = {  
      ram: 0,  
      disk: 0,  
      cpu: 0,  
      servers: 0  
    };
    package.name = packagename;
  
    let pterodactylid = await db.get(`users-${userId}`);
    
    let userinforeq = await fetch(`${newsettings.pterodactyl.domain}/api/application/users/${pterodactylid}?include=servers`, {
      method: "GET",
      headers: { 
        'Content-Type': 'application/json',
        "Authorization": `Bearer ${newsettings.pterodactyl.key}` 
      }
    });
    if (await userinforeq.statusText === "Not Found") {
      console.error("[WEBSITE] An error has occurred while attempting to get a user's information");
      console.error(`- Discord ID: ${userId}`);
      console.error(`- Pterodactyl Panel ID: ${pterodactylid}`);
      return res.send({ status: "could not find user on panel" });
    }

    let userinfo = await userinforeq.json();
  
    res.send({
      status: "success",
      coins: newsettings.coins.enabled ? (await db.get(`coins-${userId}`) || 0) : null,
      package: package,
      extra: await db.get(`extra-${userId}`) || {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      },
      userinfo: userinfo
    });
  });  

  /**
   * POST /api/setcoins
   * Sets the number of coins for a user.
   */
  app.post("/api/setcoins", async (req, res) => {	
    /* Check if the API key is valid */
    let auth = await check(req, res);
    if (!auth) return;

    if (typeof req.body !== "object") 
      return res.send({status: "body must be an object"});	
    if (Array.isArray(req.body)) 
      return res.send({status: "body cannot be an array"});	

    let id = req.body.id;	
    let coins = req.body.coins;	
    if (typeof id !== "string") 
      return res.send({status: "id must be a string"});	
    if (!(await db.get(`users-${id}`))) 
      return res.send({status: "invalid id"});	
    if (typeof coins !== "number") 
      return res.send({status: "coins must be number"});	
    if (coins < 0 || coins > 999999999999999) 
      return res.send({status: "too small or big coins"});	
    if (coins === 0) {	
      await db.delete(`coins-${id}`)	
    } else {	
      await db.set(`coins-${id}`, coins);	
    }	
    res.send({status: "success"});	
  });
  
  /**
   * POST /api/createcoupon
   * Creates a coupon with attributes such as coins, CPU, RAM, disk, and servers.
   */
  app.post("/api/createcoupon", async (req, res) => {
    /* Check if the API key is valid */
    let auth = await check(req, res);
    if (!auth) return;

    if (typeof req.body !== "object") 
      return res.send({status: "body must be an object"});
    if (Array.isArray(req.body)) 
      return res.send({status: "body cannot be an array"});

    let code = typeof req.body.code === "string" ? req.body.code.slice(0, 200) : Math.random().toString(36).substring(2, 15);

    if (!code.match(/^[a-z0-9]+$/i)) 
      return res.json({ status: "illegal characters" });

    let coins = typeof req.body.coins === "number" ? req.body.coins : 0;
    let ram = typeof req.body.ram === "number" ? req.body.ram : 0;
    let disk = typeof req.body.disk === "number" ? req.body.disk : 0;
    let cpu = typeof req.body.cpu === "number" ? req.body.cpu : 0;
    let servers = typeof req.body.servers === "number" ? req.body.servers : 0;

    if (coins < 0) 
      return res.json({ status: "coins is less than 0" });
    if (ram < 0) 
      return res.json({ status: "ram is less than 0" });
    if (disk < 0) 
      return res.json({ status: "disk is less than 0" });
    if (cpu < 0) 
      return res.json({ status: "cpu is less than 0" });
    if (servers < 0) 
      return res.json({ status: "servers is less than 0" });

    if (!coins && !ram && !disk && !cpu && !servers) 
      return res.json({ status: "cannot create empty coupon" });

    await db.set(`coupon-${code}`, {
      coins: coins,
      ram: ram,
      disk: disk,
      cpu: cpu,
      servers: servers
    });

    return res.json({ status: "success", code: code });
  });

  /**
   * POST /api/revokecoupon
   * Sets the plan for a user.
   */
  app.post("/api/revokecoupon", async (req, res) => {
    /* Check if the API key is valid */
    let auth = await check(req, res);
    if (!auth) return;

    if (typeof req.body !== "object") return res.send({ status: "body must be an object" });
    if (Array.isArray(req.body)) return res.send({ status: "body cannot be an array" });

    let code = req.body.code;

    if (!code) return res.json({ status: "missing code" });

    if (!code.match(/^[a-z0-9]+$/i)) 
      return res.json({ status: "invalid code" });

    if (!(await db.get(`coupon-${code}`))) 
      return res.json({ status: "invalid code" });

    await db.delete(`coupon-${code}`);

    res.json({ status: "success" })
  });

  /**
   * POST /api/setplan
   * Sets the plan for a user.
   */
  app.post("/api/setplan", async (req, res) => {
    /* Check if the API key is valid */
    let auth = await check(req, res);
    if (!auth) return;

    if (!req.body) 
      return res.send({ status: "missing body" });

    if (typeof req.body.id !== "string") 
      return res.send({ status: "missing id" });

    if (!(await db.get(`users-${req.body.id}`))) 
      return res.send({ status: "invalid id" });

    if (typeof req.body.package !== "string") {
      await db.delete(`package-${req.body.id}`);
      adminjs.suspend(req.body.id);
      return res.send({ status: "success" });
    } else {
      if (!newsettings.packages.list[req.body.package]) return res.send({ status: "invalid package" });
      await db.set(`package-${req.body.id}`, req.body.package);
      adminjs.suspend(req.body.id);
      return res.send({ status: "success" });
    }
  });

  /**
   * POST /api/setresources
   * Sets the resources for a user.
   */
  app.post("/api/setresources", async (req, res) => {
    /* Check if the API key is valid */
    let auth = await check(req, res);
    if (!auth) return;

    if (!req.body) 
      return res.send({ status: "missing body" });

    if (typeof req.body.id !== "string") 
      return res.send({ status: "missing id" });

    if (!(await db.get(`users-${req.body.id}`))) 
      return res.send({ status: "invalid id" });

    if (typeof req.body.ram === "number" || typeof req.body.disk === "number" || typeof req.body.cpu === "number" || typeof req.body.servers === "number") {
      let ram = req.body.ram;
      let disk = req.body.disk;
      let cpu = req.body.cpu;
      let servers = req.body.servers;

      let currentextra = await db.get(`extra-${req.body.id}`);
      let extra;

      if (typeof currentextra === "object") {
        extra = currentextra;
      } else {
        extra = {
          ram: 0,
          disk: 0,
          cpu: 0,
          servers: 0
        };
      }

      if (typeof ram === "number") {
        if (ram < 0 || ram > 999999999999999) {
          return res.send({ status: "ram size" });
        }
        extra.ram = ram;
      }

      if (typeof disk === "number") {
        if (disk < 0 || disk > 999999999999999) {
          return res.send({ status: "disk size" });
        }
        extra.disk = disk;
      }

      if (typeof cpu === "number") {
        if (cpu < 0 || cpu > 999999999999999) {
          return res.send({ status: "cpu size" });
        }
        extra.cpu = cpu;
      }

      if (typeof servers === "number") {
        if (servers < 0 || servers > 999999999999999) {
          return res.send({ status: "server size" });
        }
        extra.servers = servers;
      }

      if (extra.ram === 0 && extra.disk === 0 && extra.cpu === 0 && extra.servers === 0) {
        await db.delete(`extra-${req.body.id}`);
      } else {
        await db.set(`extra-${req.body.id}`, extra);
      }

      adminjs.suspend(req.body.id);
      return res.send({ status: "success" });
    } else {
      res.send({ status: "missing variables" });
    }
  });
};
