/**
 * Saleor GraphQL operation strings — kept as inline-tagged-template-free
 * plain strings so we don't pull in a graphql/codegen dependency for v0.1.
 *
 * Field selection is intentionally minimal — only what the adapter consumes.
 */

export const PRODUCT_FIELDS = `
  id
  name
  slug
  description
  seoDescription
  productType { name }
  thumbnail { url alt }
  media { url alt sortOrder type }
  defaultVariant {
    id
    sku
    pricing {
      price { gross { amount currency } }
    }
    quantityAvailable
  }
  variants {
    id
    sku
    name
    pricing { price { gross { amount currency } } }
    quantityAvailable
  }
  category { id name slug }
  attributes {
    attribute { slug name }
    values { name slug }
  }
`;

export const PRODUCTS_QUERY = `
query Products($first: Int!, $after: String, $channel: String!, $filter: ProductFilterInput, $sortBy: ProductOrder) {
  products(first: $first, after: $after, channel: $channel, filter: $filter, sortBy: $sortBy) {
    edges {
      cursor
      node { ${PRODUCT_FIELDS} }
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}
`;

export const PRODUCT_BY_SLUG_QUERY = `
query ProductBySlug($slug: String!, $channel: String!) {
  product(slug: $slug, channel: $channel) { ${PRODUCT_FIELDS} }
}
`;

export const PRODUCT_BY_ID_QUERY = `
query ProductById($id: ID!, $channel: String!) {
  product(id: $id, channel: $channel) { ${PRODUCT_FIELDS} }
}
`;

export const CHECKOUT_FIELDS = `
  id
  token
  email
  channel { slug }
  lines {
    id
    quantity
    variant { id sku name product { id name } }
    totalPrice { gross { amount currency } }
    unitPrice { gross { amount currency } }
  }
  subtotalPrice { gross { amount currency } }
  shippingPrice { gross { amount currency } }
  totalPrice { gross { amount currency } }
  shippingAddress {
    firstName lastName companyName streetAddress1 streetAddress2
    city countryArea postalCode country { code }
    phone
  }
  billingAddress {
    firstName lastName companyName streetAddress1 streetAddress2
    city countryArea postalCode country { code }
    phone
  }
`;

export const CHECKOUT_CREATE_MUTATION = `
mutation CheckoutCreate($input: CheckoutCreateInput!) {
  checkoutCreate(input: $input) {
    checkout { ${CHECKOUT_FIELDS} }
    errors { field code message }
  }
}
`;

export const CHECKOUT_QUERY = `
query CheckoutById($id: ID!) {
  checkout(id: $id) { ${CHECKOUT_FIELDS} }
}
`;

export const CHECKOUT_LINES_ADD_MUTATION = `
mutation CheckoutLinesAdd($id: ID!, $lines: [CheckoutLineInput!]!) {
  checkoutLinesAdd(id: $id, lines: $lines) {
    checkout { ${CHECKOUT_FIELDS} }
    errors { field code message }
  }
}
`;

export const CHECKOUT_LINES_UPDATE_MUTATION = `
mutation CheckoutLinesUpdate($id: ID!, $lines: [CheckoutLineUpdateInput!]!) {
  checkoutLinesUpdate(id: $id, lines: $lines) {
    checkout { ${CHECKOUT_FIELDS} }
    errors { field code message }
  }
}
`;

export const CHECKOUT_LINE_DELETE_MUTATION = `
mutation CheckoutLineDelete($id: ID!, $lineId: ID!) {
  checkoutLineDelete(id: $id, lineId: $lineId) {
    checkout { ${CHECKOUT_FIELDS} }
    errors { field code message }
  }
}
`;

export const CHECKOUT_SHIPPING_ADDRESS_UPDATE_MUTATION = `
mutation CheckoutShippingAddressUpdate($id: ID!, $shippingAddress: AddressInput!) {
  checkoutShippingAddressUpdate(id: $id, shippingAddress: $shippingAddress) {
    checkout { ${CHECKOUT_FIELDS} }
    errors { field code message }
  }
}
`;

export const CHECKOUT_EMAIL_UPDATE_MUTATION = `
mutation CheckoutEmailUpdate($id: ID!, $email: String!) {
  checkoutEmailUpdate(id: $id, email: $email) {
    checkout { ${CHECKOUT_FIELDS} }
    errors { field code message }
  }
}
`;

export const ORDER_FIELDS = `
  id
  number
  status
  created
  updatedAt
  userEmail
  channel { slug }
  total { gross { amount currency } }
  subtotal { gross { amount currency } }
  lines {
    id
    productSku
    productName
    variantName
    quantity
    totalPrice { gross { amount currency } }
    unitPrice { gross { amount currency } }
    variant { id product { id } }
  }
  shippingAddress {
    firstName lastName companyName streetAddress1 streetAddress2
    city countryArea postalCode country { code } phone
  }
  billingAddress {
    firstName lastName companyName streetAddress1 streetAddress2
    city countryArea postalCode country { code } phone
  }
`;

export const ORDER_BY_ID_QUERY = `
query OrderById($id: ID!) {
  order(id: $id) { ${ORDER_FIELDS} }
}
`;

export const ORDERS_QUERY = `
query Orders($first: Int!, $after: String, $filter: OrderFilterInput, $sortBy: OrderSortingInput) {
  orders(first: $first, after: $after, filter: $filter, sortBy: $sortBy) {
    edges {
      cursor
      node { ${ORDER_FIELDS} }
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}
`;
