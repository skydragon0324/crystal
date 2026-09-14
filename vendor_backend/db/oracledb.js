// This is not included to this project.
// This file is only for reference for oracle connect using oracledb

const oracledb = require('oracledb');

async function testConnection(req, res) {
  try {
    // Direct connection configuration
    let connection = await oracledb.getConnection({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING
    });

    console.log('Successfully connected to Oracle Database');
    // let result = await connection.execute(`SELECT COUNT(*) FROM ora_pid.notifications`);
    // console.log(result.rows);
    
    await connection.close();
  } catch (err) {
    console.error('Error connecting to Oracle Database: ', err);
  }
}

module.exports = {
  testConnection,
};
