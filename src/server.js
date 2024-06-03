const express = require('express')
const { urlencoded, json } = express

const axios = require('axios')
const cheerio = require('cheerio')
const archiver = require('archiver')
const fs = require('fs')
const path = require('path')

const app = express()
const port = 3000

app.use(urlencoded({ extended: true }))
app.use(json())

const username = 'hrysk_nZm3c'
const password = 'SENHAsenha22'

// app.post('/scrape', async (req, res) => {
//   const { url } = req.body

//   if (!url) {
//     return res.status(400).json({ error: 'URL is required' })
//   }

//   process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

//   const body = {
//     source: 'amazon',
//     url: url,
//     parse: true
//   }

//   try {
//     const response = await axios.post(
//       'https://realtime.oxylabs.io/v1/queries',
//       body,
//       {
//         headers: {
//           'Content-Type': 'application/json',
//           Authorization:
//             'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
//         }
//       }
//     )

//     // console.log(response.data.results[0].content)
//     res.json(response.data.results[0].content)
//   } catch (error) {
//     console.error('Error:', error)
//     res.status(500).json({ error: 'An error occurred' })
//   }
// })

app.post('/scrape', async (req, res) => {
  const { url } = req.body

  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }

  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

  const body = {
    source: 'amazon',
    url: url,
    parse: true
  }

  try {
    const response = await axios.post(
      'https://realtime.oxylabs.io/v1/queries',
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
        }
      }
    )

    const data = response.data.results[0].content
    let products = []

    if (data.page_type === 'Search') {
      // Handling search results page
      products = [...data.results.paid, ...data.results.organic]
      for (let i = 2; i <= data.last_visible_page; i++) {
        body.url = `${url}&page=${i}`
        const paginatedResponse = await axios.post(
          'https://realtime.oxylabs.io/v1/queries',
          body,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization:
                'Basic ' +
                Buffer.from(`${username}:${password}`).toString('base64')
            }
          }
        )
        const paginatedData = paginatedResponse.data.results[0].content
        products.push(
          ...paginatedData.results.paid,
          ...paginatedData.results.organic
        )
      }
    } else if (data.page_type === 'Product') {
      // Handling product detail page
      products = [data]
    } else {
      return res.status(400).json({ error: 'Invalid page type' })
    }

    const productDetails = products.map((product) => {
      return {
        ASIN: product.asin,
        title: product.title,
        variations: product.variation || [],
        price: product.price,
        shippedBy: product.featured_merchant
          ? product.featured_merchant.name
          : 'Unknown',
        description: product.description || '',
        productDetails: product.product_details || {},
        images: product.images || []
      }
    })

    // Saving product details to txt file
    const txtContent = productDetails
      .map((product) => {
        return `ASIN: ${product.ASIN}\nTitle: ${
          product.title
        }\nVariations: ${JSON.stringify(product.variations)}\nPrice: ${
          product.price
        }\nShipped By: ${product.shippedBy}\nDescription: ${
          product.description
        }\nProduct Details: ${JSON.stringify(
          product.productDetails
        )}\nImages: ${product.images.join(', ')}\n-----------`
      })
      .join('\n')

    fs.writeFileSync('products.txt', txtContent)

    // Downloading images and saving to zip
    const zip = archiver('zip', {
      zlib: { level: 9 }
    })

    const zipPath = 'images.zip'
    const output = fs.createWriteStream(zipPath)
    zip.pipe(output)

    for (const product of productDetails) {
      for (const imageUrl of product.images) {
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer'
        })
        zip.append(response.data, {
          name: `${product.ASIN}/${path.basename(imageUrl)}`
        })
      }
    }

    zip.finalize()

    res.json({
      message: 'Scraping completed',
      productsFile: 'products.txt',
      imagesZip: zipPath
    })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'An error occurred' })
  }
})

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})

const testUrl =
  // 'https://www.amazon.com.br/s?k=capacetes&__mk_pt_BR=%C3%85M%C3%85%C5%BD%C3%95%C3%91&ref=nb_sb_noss'
  'https://www.amazon.com.br/dp/B0CHJ2C1YS/ref=twister_B0CLM4QWZK?_encoding=UTF8&th=1'

const testEndpoint = async () => {
  try {
    const response = await axios.post('http://localhost:3000/scrape', {
      url: testUrl
    })

    console.log('Status:', response.status)
    console.log('Data:', response.data)
  } catch (error) {
    console.error(
      'Error:',
      error.response ? error.response.data : error.message
    )
  }
}

testEndpoint()
