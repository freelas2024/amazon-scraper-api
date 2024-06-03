const express = require('express')
const { urlencoded, json } = express

const axios = require('axios')
const archiver = require('archiver')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const zip = require('express-zip')

const app = express()
const port = 3000

app.use(urlencoded({ extended: true }))
app.use(json())
app.use(cors())

const username = 'hrysk_nZm3c'
const password = 'SENHAsenha22'

function formatProductVariations(variations) {
  return variations
    .map((variation) => {
      const { asin, dimensions } = variation
      const dimensionEntries = Object.entries(dimensions)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
      return `ASIN: ${asin}, Dimensões: ${dimensionEntries}`
    })
    .join('\n')
}
app.post('/scrape', async (req, res) => {
  const { url } = req.body

  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }

  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

  const body = {
    source: 'amazon',
    url: url,
    parse: true,
    domain: 'com.br',
    // locale: 'pt_BR'
    geo_location: '59090495'
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

    console.log('PASSOU AQUI ==>', data.results.organic[0])

    if (data.page_type === 'Product') {
      products = [data]
    } else {
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
    }

    const detailedProducts = []
    for (const product of products) {
      const productDetailResponse = await axios.post(
        'https://realtime.oxylabs.io/v1/queries',
        {
          source: 'amazon_product',
          query: product.asin,
          parse: true,
          domain: 'com.br',
          context: [{ key: 'autoselect_variant', value: true }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization:
              'Basic ' +
              Buffer.from(`${username}:${password}`).toString('base64')
          }
        }
      )

      const productDetail = productDetailResponse.data.results[0].content
      detailedProducts.push(productDetail)
    }

    const productDetails = detailedProducts.map((product) => {
      // console.log(product.variation)

      const formattedVariations =
        formatProductVariations(product.variation) || 'Sem variações'

      return {
        ASIN: product.asin,
        title: product.title,
        variations: formattedVariations,
        price: product.price_upper,
        shippedBy: product.featured_merchant
          ? product.featured_merchant.name
          : product.manufacturer,
        description: product.description || 'Produto sem descrição',
        productDetails: product.product_details || {},
        images: product.images || []
      }
    })

    const txtContent = productDetails
      .map((product) => {
        return `ASIN: ${product.ASIN}\nTítulo do anúncio: ${
          product.title
        }\nVariações:\n${product.variations}\nPreço: R$ ${
          product.price
        }\nEnviado por : ${product.shippedBy}\nDescrição: ${
          product.description
        }\nDetalhes do produto: ${JSON.stringify(
          product.productDetails
        )}\nImagens: ${product.images.join(', ')}\n-----------`
      })
      .join('\n')

    const txtFilePath = path.join(__dirname, 'products.txt')
    fs.writeFileSync(txtFilePath, txtContent)

    const zip = archiver('zip', {
      zlib: { level: 9 }
    })

    res.attachment('scraped_data.zip')
    zip.pipe(res)

    zip.file(txtFilePath, { name: 'products.txt' })

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

    await zip.finalize()
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'An error occurred' })
  }
})

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})

const testUrl =
  'https://www.amazon.com.br/s?k=capacetes&__mk_pt_BR=%C3%85M%C3%85%C5%BD%C3%95%C3%91&ref=nb_sb_noss'
// 'https://www.amazon.com.br/dp/B0CHJ2C1YS/ref=twister_B0CLM4QWZK?_encoding=UTF8&th=1'
// 'https://www.amazon.com.br/Sapato-Social-Masculino-Casual-Amarrar/dp/B0BKGT6W4R/ref=sr_1_7?dib=eyJ2IjoiMSJ9.-2Gdj6V_4fmPI0aG3yzs2-66nZnC04IG8Lj8niBvQOv7dC1ZCjW8A21Z6oE-AWxfENva6cXtH79mviE23UZbb0c1C72PaFtyzM7uhCGpWVEE1mQ5fLwdvGTttZFWZJoT1NCqJPJ9vSJ1qDFEZmzUsaodjg3phFV1L4JsRK9A-0MpLgl6j9xdhZ4n2rYl3FK20Qc0Cwp3bJf_ZZX9SO8yJYRgczbEhLEvbdsxRV1BCooMdE6zABaIaR8wspqMW1MwcYfywW-xGeLMdf90O9gnXhiXs0J2yJVKlje2IXddESE.Ibe8xXNmnAMI5kuI8aGXM5Xya-Lo96I-YjIdhdxrEYU&dib_tag=se&keywords=sapato&qid=1717431690&sr=8-7&ufe=app_do%3Aamzn1.fos.6d798eae-cadf-45de-946a-f477d47705b9'

const testEndpoint = async () => {
  try {
    const response = await axios.post('http://localhost:3000/scrape', {
      url: testUrl
    })

    // console.log('Status:', response.status)
    // console.log('Data:', response.data)
  } catch (error) {
    console.error(
      'Error:',
      error.response ? error.response.data : error.message
    )
  }
}

testEndpoint()
