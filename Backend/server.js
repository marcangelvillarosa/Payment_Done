const express = require('express');
const mysql = require('mysql');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // To parse JSON data

app.post('/api/payment-link', async (req, res) => {
    const { amount } = req.body;
  
    try {
      const response = await axios.post('https://api.paymongo.com/v1/links', {
        data: {
          attributes: {
            amount: amount,
            description: "none",
            remarks: "none"
          }
        }
      }, {
        headers: {
          'accept': 'application/json',
          'authorization': `Basic ${Buffer.from('sk_test_wvTfm2Zeo5j541jXJApMu3jr').toString('base64')}`,
          'content-type': 'application/json'
        }
      });
  
      return res.json(response.data);
    } catch (error) {
      console.error('Payment link creation error:', error);
      return res.status(500).json({ message: 'Payment link creation failed' });
    }
  });
  

// Create MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: 'root',
    password: '',
    database: 'imfinal'
});

// Test route
app.get('/', (req, res) => {
    return res.json("From the backend");
});

// Users route
app.get('/customers', (req, res) => {
    const sql = "SELECT * FROM customers";
    db.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data);
    });
});

// Login route
app.post('/login', (req, res) => {
    const { email, password } = req.body;  // Using 'email' and 'password' from the request body
    const sql = "SELECT * FROM customers WHERE Email = ? AND Password = ?";  // Use 'Email' and 'Password' as per your database schema
    
    db.query(sql, [email, password], (err, data) => {
        if (err) return res.json(err);  // Handle SQL errors

        if (data.length > 0) {
            console.log("Yes");
            return res.json({ success: true, message: "Login successful" });
        } else {
            console.log("No");
            return res.json({ success: false, message: "Invalid email or password" });
        }
    });
});

app.post('/book', (req, res) => {
    const { date, time, serviceName, userEmail } = req.body;

    // Check for missing fields
    if (!date || !time || !serviceName || !userEmail) {
        return res.status(400).json({ success: false, message: 'Date, Time, Service Name, and User Email are required' });
    }

    // Fetch the serviceID and price from the service table based on serviceName
    const getServiceQuery = 'SELECT serviceID, Price FROM service WHERE serviceName = ?';
    db.query(getServiceQuery, [serviceName], (err, serviceResults) => {
        if (err) {
            console.error('Error fetching serviceID:', err);
            return res.status(500).json({ success: false, message: 'Error fetching serviceID' });
        }

        if (serviceResults.length === 0) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }

        const serviceID = serviceResults[0].serviceID;
        const servicePrice = serviceResults[0].Price;

        // Fetch the customerID based on userEmail
        const getCustomerIdQuery = 'SELECT CustomerID FROM customers WHERE Email = ?';
        db.query(getCustomerIdQuery, [userEmail], (err, customerResults) => {
            if (err) {
                console.error('Error fetching customerID:', err);
                return res.status(500).json({ success: false, message: 'Error fetching customerID' });
            }

            if (customerResults.length === 0) {
                return res.status(404).json({ success: false, message: 'Customer not found' });
            }

            const customerID = customerResults[0].CustomerID;

            // Insert the appointment with the serviceID, customerID, and status
            const insertAppointmentQuery = 'INSERT INTO appointment (Date, Time, ServiceName, ServiceID, CustomerID, Status) VALUES (?, ?, ?, ?, ?, ?)';
            db.query(insertAppointmentQuery, [date, time, serviceName, serviceID, customerID, 'Pending'], (err, result) => {
                if (err) {
                    console.error('Error inserting appointment:', err);
                    return res.status(500).json({ success: false, message: 'Booking failed' });
                }

                // Success response for booking
                return res.json({ success: true, message: 'Booking successful!' });
            });
        });
    });
});

app.post('/billing', (req, res) => {
    const { totalAmount, billingDate, userEmail } = req.body;

    // Check for missing fields
    if (!totalAmount || !billingDate || !userEmail) {
        return res.status(400).json({ success: false, message: 'Total Amount, Billing Date, and User Email are required' });
    }

    // Fetch the customerID based on userEmail
    const getCustomerIdQuery = 'SELECT CustomerID FROM customers WHERE Email = ?';
    db.query(getCustomerIdQuery, [userEmail], (err, customerResults) => {
        if (err) {
            console.error('Error fetching customerID:', err);
            return res.status(500).json({ success: false, message: 'Error fetching customerID' });
        }

        if (customerResults.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        const customerID = customerResults[0].CustomerID;

        // Check if a billing record exists for this customer
        const getBillingQuery = 'SELECT BillingID, TotalAmount, BillingDate FROM billing WHERE CustomerID = ?';
        db.query(getBillingQuery, [customerID], (err, billingResults) => {
            if (err) {
                console.error('Error fetching billing data:', err);
                return res.status(500).json({ success: false, message: 'Error fetching billing data' });
            }

            const existingBilling = billingResults.length > 0 ? billingResults[0] : null;

            if (!existingBilling) {
                // No existing billing record, insert a new one
                const insertBillingQuery = 'INSERT INTO billing (TotalAmount, BillingDate, CustomerID) VALUES (?, ?, ?)';
                db.query(insertBillingQuery, [totalAmount, billingDate, customerID], (err, billingResult) => {
                    if (err) {
                        console.error('Error inserting billing:', err);
                        return res.status(500).json({ success: false, message: 'Error generating invoice' });
                    }

                    const billingID = billingResult.insertId;

                    // Insert into payment table
                    const insertPaymentQuery = 'INSERT INTO payment (appointmentID, customerID, BillingID, TotalAmount) VALUES (?, ?, ?, ?)';
                    
                    // Fetch appointmentID for the customer
                    const getAppointmentQuery = 'SELECT appointmentID FROM appointment WHERE CustomerID = ?';
                    db.query(getAppointmentQuery, [customerID], (err, appointmentResults) => {
                        if (err) {
                            console.error('Error fetching appointmentID:', err);
                            return res.status(500).json({ success: false, message: 'Error fetching appointmentID' });
                        }

                        if (appointmentResults.length === 0) {
                            return res.status(404).json({ success: false, message: 'No appointments found for this customer' });
                        }

                        const appointmentID = appointmentResults[0].appointmentID;

                        db.query(insertPaymentQuery, [appointmentID, customerID, billingID, totalAmount], (err) => {
                            if (err) {
                                console.error('Error inserting payment:', err);
                                return res.status(500).json({ success: false, message: 'Error recording payment' });
                            }

                            // Success response for new billing and payment record
                            return res.json({ success: true, message: 'Billing and payment record created successfully!' });
                        });
                    });
                });
            } else {
                // Billing record exists, check if any service quantity has changed or new services have been added
                const { BillingID: existingBillingID, TotalAmount: currentTotal, BillingDate: lastBillingDate } = existingBilling;

                // Recalculate the total amount for the user
                const getUpdatedTotalQuery = `
                    SELECT
                        s.Price,
                        COUNT(*) as quantity
                    FROM
                        appointment a
                    JOIN
                        service s
                    ON
                        a.ServiceID = s.serviceID
                    WHERE
                        a.CustomerID = ?
                    GROUP BY
                        s.Price
                `;
                db.query(getUpdatedTotalQuery, [customerID], (err, results) => {
                    if (err) {
                        console.error('Error recalculating total amount:', err);
                        return res.status(500).json({ success: false, message: 'Error recalculating total amount' });
                    }

                    const newTotal = results.reduce((acc, curr) => acc + (curr.Price * curr.quantity), 0);

                    if (newTotal === currentTotal) {
                        // If no change in total, do not update
                        return res.json({ success: true, message: 'No changes in service quantities, billing not updated' });
                    }

                    // Update the billing record
                    const updateBillingQuery = 'UPDATE billing SET TotalAmount = ?, BillingDate = ? WHERE BillingID = ?';
                    db.query(updateBillingQuery, [newTotal, billingDate, existingBillingID], (err) => {
                        if (err) {
                            console.error('Error updating billing:', err);
                            return res.status(500).json({ success: false, message: 'Error updating billing record' });
                        }

                        // Update the payment record
                        const updatePaymentQuery = 'UPDATE payment SET TotalAmount = ? WHERE BillingID = ? AND customerID = ?';
                        db.query(updatePaymentQuery, [newTotal, existingBillingID, customerID], (err) => {
                            if (err) {
                                console.error('Error updating payment:', err);
                                return res.status(500).json({ success: false, message: 'Error updating payment record' });
                            }

                            // Success response for updated billing and payment record
                            return res.json({ success: true, message: 'Billing and payment record updated successfully!' });
                        });
                    });
                });
            }
        });
    });
});





app.post('/userAppointments', (req, res) => {
    const { userEmail } = req.body;

    if (!userEmail) {
        return res.status(400).json({ success: false, message: 'User email is required' });
    }

    // Fetch serviceName, Price, and quantity from appointments for the current user
    const sql = `
        SELECT
            s.serviceName,
            s.Price,
            COUNT(*) as quantity
        FROM
            appointment a
        JOIN
            service s
        ON
            a.ServiceID = s.serviceID
        JOIN
            customers c
        ON
            a.CustomerID = c.CustomerID
        WHERE
            c.Email = ?
        GROUP BY
            s.serviceName, s.Price
    `;

    db.query(sql, [userEmail], (err, results) => {
        if (err) {
            console.error('Error fetching user appointments:', err);
            return res.status(500).json({ success: false, message: 'Error fetching appointments' });
        }

        // Calculate the total price
        const totalPrice = results.reduce((acc, curr) => acc + (curr.Price * curr.quantity), 0);

        res.json({
            success: true,
            data: results,
            totalPrice,
        });
    });
});




app.get('/appointments', (req, res) => {
    const sql = `
        SELECT
            a.appointmentID,
            a.date,
            a.time,
            s.serviceName,
            s.serviceID,
            s.Description,
            s.Price
        FROM
            appointment a
        JOIN
            service s
        ON
            a.serviceName = s.serviceName
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/getUserDetails', (req, res) => {
    const { email } = req.body; // or you can use CustomerID if you store it
  
    const sql = 'SELECT * FROM customers WHERE Email = ?';
    db.query(sql, [email], (err, result) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      if (result.length > 0) {
        return res.json({ success: true, data: result[0] });
      } else {
        return res.json({ success: false, message: 'No user found' });
      }
    });
  });

app.post('/signup', (req, res) => {
    const { email, password, fname, lname, phone, street, city } = req.body;

    // Insert user data into the database
    const sql = "INSERT INTO customers (Email, Password, FName, LName, Phone, Street, City) VALUES (?, ?, ?, ?, ?, ?, ?)";
    
    db.query(sql, [email, password, fname, lname, phone, street, city], (err, result) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: "Sign up failed" });
        }
        return res.json({ success: true, message: "Sign up successful" });
    });
});

// Start server
app.listen(8081, () => {
    console.log("listening on port 8081");
});
