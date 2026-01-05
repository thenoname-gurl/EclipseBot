module.exports = (client) => {
    client.events = async (eventFiles) => {
        for (const file of eventFiles) {
            const event = require(`./events/${file}`);
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
                if (gconfig.debug == "1") {
                   console.log(`Loaded once excute state event: ${event.name}`)
                }
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
                if (gconfig.debug == "1") {
                   console.log(`Loaded normal excute state event: ${event.name}`)
                }
            }
        }
    };
}
