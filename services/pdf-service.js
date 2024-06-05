const { auto } = require('async');
const { x } = require('pdfkit');
const PDFDocument = require('pdfkit-table'); // Include pdfkit-table

function generateInvoicePDF(invoice, dataCallback, endCallback) {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    // Header Section
    doc.image('public/images/logo.png', 30, 20, { width: 65 }); // Add your logo image
    doc.fillColor('#0d1170').font('Times-Bold').fontSize(16).text('HEBIMA PLUS (PVT) LTD', { align: 'center' });
    doc.fillColor('#0d1170').font('Times-Bold').fontSize(14).text('Purchase Order', { align: 'center' });
    doc.fillColor('black').font('Times-Roman').fontSize(10).text('No. 7, Weragampita Temple Road, Uyanwatta, Matara', { align: 'center' });
    doc.font('Helvetica').text('Tel – 0777121770/0716247541', { align: 'center' });
    doc.image('public/images/line.png', 0, 80, { width: doc.page.width }); // Add your logo image


    doc.moveDown(3);

    // Define position and size of the rectangle
    const rectX = doc.page.width - 130;
    const rectY = 100;
    const rectWidth = 100;
    const rectHeight = 25;

    // Draw the rectangle
    doc.text(`PO No. ${invoice.po_number} `, 470, 110);
    doc.rect(rectX, rectY, rectWidth, rectHeight).stroke();

    doc.moveDown(2);

    doc.font('Times-Roman').fontSize(12).text(`To: ${invoice.recipient} `, 30, 155, { continued: true } );
    // doc.text(`Invoice ID: ${invoice.invoice_id}`); // Dynamic insertion of invoice ID

    const formattedDate = new Date().toLocaleDateString('en-GB'); // 'en-GB' formats the date as dd/mm/yyyy
    doc.text(`Date: ${formattedDate}`, { align: 'right' });

    doc.moveDown(2);

    // Define table structure
    // Define table structure with headers and datas
    const table = {
        headers: [
            { label: 'No', property: 'no', width: 30 },
            { label: 'Item Description', property: 'description', width: 245 },
            { label: 'Units', property: 'units', width: 60, headerAlign: "center", align: "right" },
            { label: 'QTY', property: 'quantity', width: 50, headerAlign: "center", align: "right" },
            { label: 'Unit Rate', property: 'unit_rate', width: 75, headerAlign: "right", align: "right" },
            { label: 'Amount in LKR', property: 'amount', width: 75, headerAlign: "right", align: "right" }
        ],
        datas: invoice.items.map((item, index) => ({
            no: index + 1,
            description: item.description,
            units: item.unit || '',
            quantity: item.quantity,
            unit_rate: item.price_per_item.toFixed(2),
            amount: (item.quantity * item.price_per_item).toFixed(2)
        }))
    };

    // Add table to PDF
    doc.table(table, {
        padding: 5,
        align: "center",
        prepareHeader: () => {
            doc.font('Helvetica-Bold').fontSize(10);
            doc.lineWidth(1);
            doc.strokeColor('black');
        },
        prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
            doc.font('Helvetica').fontSize(10);
            const { x, y, width, height } = rectCell;
            // first line 
            if (indexColumn === 0) {
                doc
                    .moveTo(x, y)
                    .lineTo(x, y + height)
                    .stroke();
            }
            doc
                .moveTo(x + width, y)
                .lineTo(x + width, y + height)
                .stroke();
            doc.fontSize(10).fillColor('#292929');
        },
    });

    const tableBottomY = doc.y;

    // Footer Section
    // doc.moveDown(5);
    // doc.fontSize(10).text(`..............................................`, { align: 'right' });
    doc.image('public/images/Stamp and sign white bg.png', { x: doc.page.width - 170, y: tableBottomY + 10, width: 150 }); // Position the image just below the table
    // doc.text('Authorized Stamp & Signature', { align: 'right' });

    doc.end();
}

module.exports = { generateInvoicePDF };
