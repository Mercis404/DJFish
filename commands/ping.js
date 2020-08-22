module.exports = {
    name: 'ping',
    discription: "This is a ping command",
    execute(message, args){
        message.channel.send('Pong!');
    }
}