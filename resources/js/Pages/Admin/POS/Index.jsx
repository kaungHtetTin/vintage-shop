import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Head, Link, useForm, usePage } from '@/spa/router';
import LanguageSwitcher from '@/Components/LanguageSwitcher';
import { usePhraseTranslation, useTranslation } from '@/Utils/i18n';
import { routeWithBase, storageUrl } from '@/Utils/url';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Radio,
    RadioGroup,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    useMediaQuery,
} from '@mui/material';
import {
    Add as AddIcon,
    ArrowBack as ArrowBackIcon,
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
    Close as CloseIcon,
    Delete as DeleteIcon,
    ExpandLess as ExpandLessIcon,
    ExpandMore as ExpandMoreIcon,
    ImageOutlined as ImagePlaceholderIcon,
    MoneyOff as FocIcon,
    PointOfSale as CheckoutIcon,
    Print as PrintIcon,
    QrCodeScanner as ScanIcon,
    Remove as RemoveIcon,
    Search as SearchIcon,
} from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import { formatMoney } from '@/Utils/pricing';
import { formatSelectedUnitQuantity } from '@/Utils/unitLabel';
import { formatUnitWithConversion } from '@/Utils/unitLabel';

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const money = formatMoney;
const POS_RESULT_PAGE_SIZE = 24;
const POS_TABLE_ROW_HEIGHT = 44;
const POS_RESULT_OVERSCAN_ROWS = 6;
const WALK_IN_CUSTOMER = Object.freeze({
    id: null,
    name: 'Walk-in customer',
    phone: null,
    email: null,
    credit_status: 'disabled',
    available_credit: 0,
    is_walk_in: true,
});
const calculateLineTotal = (line) => Number(line.quantity || 0) * Number(line.unit_price || 0);
const calculateLineBaseUsage = (line) => {
    const paidBase = Number(line.quantity || 0) * Number(line.conversion_factor || 1);
    const focUnit = (line.unit_options || []).find((unit) => Number(unit.id) === Number(line.foc_product_unit_id));
    const focBase = Number(line.foc_quantity || 0) * Number(focUnit?.conversion_factor || 1);

    return paidBase + focBase;
};
const lineExceedsStock = (line) => calculateLineBaseUsage(line) > Number(
    line.available_base_qty || (Number(line.available_qty || 0) * Number(line.conversion_factor || 1)),
) + 0.00005;
const resolveSellingPrice = (prices, priceType) => {
    const selectedPrice = Number((prices || []).find((price) => price.price_type === priceType)?.price || 0);
    if (selectedPrice > 0) return { price_type: priceType, price: selectedPrice };

    if (priceType === 'wholesale' || priceType === 'whole_sale') {
        const retailPrice = Number((prices || []).find((price) => price.price_type === 'retail')?.price || 0);
        if (retailPrice > 0) return { price_type: 'retail', price: retailPrice };
    }

    return { price_type: priceType, price: 0 };
};
const resolveCartPrice = (prices, priceType) => ({ ...resolveSellingPrice(prices, priceType), use_flash_sale: false });

export default function PosIndex({ locations = [], categories = [], priceTypes = ['retail'], can = {}, editOrder = null, editCart = [] }) {
    const uiText = useUiTranslation();
    const { app_base, app_url, app_settings = {}, admin_landing_path, auth, flash = {}, errors: pageErrors = {} } = usePage().props;
    const logoutForm = useForm({});
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const t = useTranslation();
    const tp = usePhraseTranslation();
    const firstLocation = locations.find((item) => Number(item.id) === Number(editOrder?.location_id)) || locations[0];
    const [locationId, setLocationId] = useState(firstLocation?.id || '');
    const [categoryId, setCategoryId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [resultMeta, setResultMeta] = useState({ page: 1, per_page: POS_RESULT_PAGE_SIZE, has_more: false, next_page: null, mode: 'popular' });
    const [searchLoading, setSearchLoading] = useState(false);
    const [productResultsElement, setProductResultsElement] = useState(null);
    const [productScrollTop, setProductScrollTop] = useState(0);
    const [productViewportHeight, setProductViewportHeight] = useState(520);
    const [scanError, setScanError] = useState('');
    const [mobileAppBarExpanded, setMobileAppBarExpanded] = useState(false);
    const [cart, setCart] = useState([]);
    const [customerOptions, setCustomerOptions] = useState([WALK_IN_CUSTOMER]);
    const [customerSearchInput, setCustomerSearchInput] = useState('');
    const [customerLoading, setCustomerLoading] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(WALK_IN_CUSTOMER);
    const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
    const [customerCreateErrors, setCustomerCreateErrors] = useState({});
    const [customerCreating, setCustomerCreating] = useState(false);
    const [salePriceType, setSalePriceType] = useState('retail');
    const [discountType, setDiscountType] = useState('');
    const [discountValue, setDiscountValue] = useState('');
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [mobileStep, setMobileStep] = useState('products');
    const [tenderType, setTenderType] = useState('cash');
    const [amountTendered, setAmountTendered] = useState('');
    const [splitAmounts, setSplitAmounts] = useState({ cash: '', mmqr: '', credit: '' });
    const [creditDepositMethod, setCreditDepositMethod] = useState('cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [saleNote, setSaleNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [errors, setErrors] = useState({});
    const [receipt, setReceipt] = useState(null);
    const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    const searchInputRef = useRef(null);
    const categoryScrollRef = useRef(null);
    const checkoutIntentRef = useRef('complete');
    const checkoutSubmittingRef = useRef(false);
    const productScrollFrameRef = useRef(null);
    const productLoadMoreSentinelRef = useRef(null);
    const productLoadMoreLockRef = useRef(false);

    const location = locations.find((item) => Number(item.id) === Number(locationId));
    const paymentMethods = ['cash', 'mmqr', ...(can.credit ? ['credit'] : []), 'split'];
    const api = async (url, options = {}) => {
        setErrors({});
        try {
            const response = await window.axios({ url: routeWithBase(url, app_base), ...options });
            return response.data;
        } catch (error) {
            const nextErrors = error.response?.data?.errors || { request: error.response?.data?.message || tp('Request failed.') };
            setErrors(nextErrors);
            throw error;
        }
    };

    useEffect(() => { if (!editOrder) setCart([]); }, [locationId, editOrder?.id]);

    useEffect(() => {
        if (!editOrder) return;
        try {
                if (!editCart.length) throw new Error(tp('The original sale has no editable items.'));
                setCart(editCart.map((line) => ({ ...line })));
                setSalePriceType(editOrder.items?.[0]?.price_type || 'retail');
                setDiscountType(editOrder.admin_discount_type || '');
                setDiscountValue(String(editOrder.admin_discount_value || ''));
                setSaleNote(editOrder.order_notes || '');
                if (editOrder.user) {
                    const customer = { ...editOrder.user, is_walk_in: false };
                    setCustomerOptions([WALK_IN_CUSTOMER, customer]);
                    setSelectedCustomer(customer);
                }
                const allocations = {};
                (editOrder.payments || []).filter((payment) => payment.status === 'paid').forEach((payment) => {
                    allocations[payment.tender_type || payment.method] = (allocations[payment.tender_type || payment.method] || 0) + Number(payment.amount || 0);
                    if ((payment.tender_type || payment.method) === 'mmqr') setPaymentReference(payment.payment_details?.reference || '');
                });
                if (Number(editOrder.credit_amount || 0) > 0) allocations.credit = Number(editOrder.credit_amount);
                const methods = Object.keys(allocations).filter((key) => allocations[key] > 0);
                if (methods.length > 1) {
                    setTenderType('split');
                    setSplitAmounts({ cash: String(allocations.cash || ''), mmqr: String(allocations.mmqr || ''), credit: String(allocations.credit || '') });
                } else {
                    const method = methods[0] || 'cash';
                    setTenderType(method);
                    setAmountTendered(String(method === 'credit' ? Number(editOrder.paid_amount || 0) : allocations[method] || editOrder.final_amount));
                }
                setMessage(`${tp('Editing POS sale')} ${editOrder.order_number}`);
        } catch (error) {
            setErrors({ edit: error.message || tp('Unable to load this POS sale for editing.') });
        }
    }, [editOrder?.id, editCart]);

    const fetchSearch = useCallback(async (options = {}) => {
        const { autoAddFirst = false, clearInputAfterSearch = false, append = false, page = 1 } = options;
        if (!locationId) return;

        setScanError('');
        setSearchLoading(true);
        try {
            const data = await api('/admin/pos/products/search', {
                method: 'get',
                params: { location_id: locationId, category_id: categoryId || undefined, q: searchQuery.trim(), page, per_page: resultMeta.per_page },
            });
            const products = Array.isArray(data) ? data : data.data || [];
            const meta = Array.isArray(data)
                ? { page, per_page: resultMeta.per_page, has_more: false, next_page: null, mode: searchQuery.trim() ? 'search' : 'popular' }
                : data.meta;
            setResultMeta(meta);
            setSearchResults((prev) => {
                if (!append) return products;
                const existingIds = new Set(prev.map((item) => item.id));
                return [...prev, ...products.filter((item) => !existingIds.has(item.id))];
            });
            if (autoAddFirst && products[0]) {
                addProductToCart(products[0]);
            }
        } finally {
            setSearchLoading(false);
            if (clearInputAfterSearch) {
                setSearchQuery('');
                window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }
        }
    }, [app_base, categoryId, locationId, resultMeta.per_page, searchQuery]);

    const loadMoreProducts = useCallback(async () => {
        if (productLoadMoreLockRef.current || searchLoading || !resultMeta.has_more) return;

        productLoadMoreLockRef.current = true;
        try {
            await fetchSearch({
                append: true,
                page: resultMeta.next_page || resultMeta.page + 1,
            });
        } catch {
            // The shared request helper already exposes the error in the POS alert area.
        } finally {
            productLoadMoreLockRef.current = false;
        }
    }, [fetchSearch, resultMeta.has_more, resultMeta.next_page, resultMeta.page, searchLoading]);

    const fetchCustomers = useCallback(async (query) => {
        setCustomerLoading(true);
        try {
            const data = await api('/admin/pos/customers/search', {
                method: 'get',
                params: { q: query.trim() },
            });
            const customers = Array.isArray(data) ? data : [];
            setCustomerOptions([WALK_IN_CUSTOMER, ...customers]);
        } catch {
            setCustomerOptions([WALK_IN_CUSTOMER]);
        } finally {
            setCustomerLoading(false);
        }
    }, [app_base]);

    const createCustomer = async (event) => {
        event.preventDefault();
        setCustomerCreateErrors({});
        setCustomerCreating(true);
        try {
            const response = await window.axios.post(routeWithBase('/admin/pos/customers', app_base), newCustomer);
            const customer = response.data.customer;
            setCustomerOptions((current) => [customer, ...current.filter((item) => item.id !== customer.id)]);
            setSelectedCustomer(customer);
            setCustomerSearchInput(customer.name);
            setNewCustomer({ name: '', email: '', phone: '' });
            setCustomerDialogOpen(false);
            setMessage(tp('Customer created and selected.'));
        } catch (error) {
            setCustomerCreateErrors(error.response?.data?.errors || { request: error.response?.data?.message || tp('Unable to create customer.') });
        } finally {
            setCustomerCreating(false);
        }
    };

    useEffect(() => {
        const updateNetworkState = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', updateNetworkState);
        window.addEventListener('offline', updateNetworkState);
        return () => {
            window.removeEventListener('online', updateNetworkState);
            window.removeEventListener('offline', updateNetworkState);
        };
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            fetchSearch();
        }, 180);
        return () => window.clearTimeout(timer);
    }, [fetchSearch]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            fetchCustomers(customerSearchInput);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [customerSearchInput, fetchCustomers]);

    useEffect(() => {
        window.setTimeout(() => searchInputRef.current?.focus(), 150);
    }, []);

    useEffect(() => {
        if (!productResultsElement) return undefined;

        const updateMetrics = () => {
            setProductScrollTop(productResultsElement.scrollTop);
            setProductViewportHeight(productResultsElement.clientHeight || 520);

            const remainingScroll = productResultsElement.scrollHeight
                - productResultsElement.scrollTop
                - productResultsElement.clientHeight;
            const preloadDistance = Math.max(220, productResultsElement.clientHeight * 0.35);
            const hasInternalScroll = productResultsElement.scrollHeight > productResultsElement.clientHeight + 1;
            if (hasInternalScroll && remainingScroll <= preloadDistance) {
                loadMoreProducts();
            }
        };
        const onScroll = () => {
            if (productScrollFrameRef.current) return;
            productScrollFrameRef.current = window.requestAnimationFrame(() => {
                productScrollFrameRef.current = null;
                updateMetrics();
            });
        };

        updateMetrics();
        productResultsElement.addEventListener('scroll', onScroll, { passive: true });

        let resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(updateMetrics);
            resizeObserver.observe(productResultsElement);
        }

        return () => {
            productResultsElement.removeEventListener('scroll', onScroll);
            resizeObserver?.disconnect();
            if (productScrollFrameRef.current) {
                window.cancelAnimationFrame(productScrollFrameRef.current);
                productScrollFrameRef.current = null;
            }
        };
    }, [loadMoreProducts, productResultsElement]);

    useEffect(() => {
        if (
            !productResultsElement
            || !productLoadMoreSentinelRef.current
            || !resultMeta.has_more
            || typeof IntersectionObserver === 'undefined'
        ) return undefined;

        const hasInternalScroll = productResultsElement.scrollHeight > productResultsElement.clientHeight + 1;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) loadMoreProducts();
        }, {
            root: hasInternalScroll ? productResultsElement : null,
            rootMargin: '300px 0px',
            threshold: 0,
        });

        observer.observe(productLoadMoreSentinelRef.current);
        return () => observer.disconnect();
    }, [loadMoreProducts, productResultsElement, resultMeta.has_more, searchResults.length]);

    useEffect(() => {
        productResultsElement?.scrollTo({ top: 0 });
        setProductScrollTop(0);
    }, [categoryId, locationId, searchQuery, productResultsElement]);

    useEffect(() => {
        if (isMobile && cart.length === 0 && mobileStep !== 'products') {
            setMobileStep('products');
        }
    }, [cart.length, isMobile, mobileStep]);

    useEffect(() => {
        if (!editOrder) {
            setCart([]);
        }
        setSearchResults([]);
        setResultMeta((prev) => ({ ...prev, page: 1, has_more: false, next_page: null, mode: 'popular' }));
        setSearchQuery('');
    }, [locationId, editOrder?.id]);

    const getProductDisplayName = (product) => [product?.product_name, product?.unit_name].filter(Boolean).join(' · ') || product?.product_code || tp('Product');

    const resolveProductPrice = (product, priceType = salePriceType) => {
        return resolveCartPrice(product?.prices, priceType, product?.flash_sale, false).price;
    };


    const addProductToCart = (product) => {
        if (Number(product?.available_qty || 0) <= 0) {
            setScanError(`${getProductDisplayName(product)}: ${tp('Out of stock')}`);
            return;
        }

        setCart((prev) => {
            const sellingPrice = resolveCartPrice(product.prices, salePriceType, product.flash_sale, false);
            const appliedPriceType = sellingPrice.price_type;
            const existingIndex = prev.findIndex((line) => Number(line.product_unit_id) === Number(product.id));
            if (existingIndex >= 0) {
                const updated = [...prev];
                const line = updated[existingIndex];
                updated[existingIndex] = {
                    ...line,
                    quantity: Math.min(Number(line.quantity || 0) + 1, Number(line.available_qty || 1)),
                };
                return updated;
            }

            return [
                ...prev,
                {
                    id: makeId(),
                    product_unit_id: product.id,
                    product_id: product.product_id,
                    product_code: product.product_code,
                    barcode: product.barcode,
                    product_name: product.product_name,
                    name: getProductDisplayName(product),
                    unit_name: product.unit_name,
                    unit_code: product.unit_code,
                    image_path: product.image_path,
                    available_qty: Number(product.available_qty || 0),
                    available_base_qty: Number(product.available_base_qty || 0),
                    conversion_factor: Number(product.conversion_factor || 1),
                    prices: product.prices || [],
                    flash_sale: product.flash_sale || null,
                    unit_options: product.unit_options || [],
                    price_type: appliedPriceType,
                    unit_price: sellingPrice.price,
                    use_flash_sale: sellingPrice.use_flash_sale,
                    quantity: 1,
                    foc_quantity: 0,
                    foc_product_unit_id: product.id,
                },
            ];
        });
    };

    const updateCartLine = (id, patch) => {
        setCart((prev) => prev.map((line) => {
            if (line.id !== id) return line;
            const updated = { ...line, ...patch };
            updated.quantity = Math.max(1, Math.min(Number(updated.quantity || 1), Number(line.available_qty || 1)));
            updated.unit_price = Math.max(0, Number(updated.unit_price || 0));
            return updated;
        }));
    };

    const changeCartUnit = (id, productUnitId) => {
        setCart((prev) => prev.map((line) => {
            if (line.id !== id) return line;
            const unit = (line.unit_options || []).find((option) => Number(option.id) === Number(productUnitId));
            if (!unit || Number(unit.available_qty || 0) <= 0) return line;
            const sellingPrice = resolveCartPrice(unit.prices, salePriceType, unit.flash_sale, false);

            return {
                ...line,
                product_unit_id: unit.id,
                unit_name: unit.name,
                unit_code: unit.code,
                name: [line.product_name, unit.name].filter(Boolean).join(' · '),
                available_qty: Number(unit.available_qty || 0),
                conversion_factor: Number(unit.conversion_factor || 1),
                prices: unit.prices || [],
                flash_sale: unit.flash_sale || null,
                price_type: sellingPrice.price_type,
                unit_price: sellingPrice.price,
                use_flash_sale: false,
                quantity: Math.max(1, Math.min(Number(line.quantity || 1), Number(unit.available_qty || 1))),
            };
        }));
    };

    const changeCartFocUnit = (id, productUnitId) => {
        if (!can.discount) return;
        setCart((prev) => prev.map((line) => {
            if (line.id !== id) return line;
            const unit = (line.unit_options || []).find((option) => Number(option.id) === Number(productUnitId));
            return unit ? { ...line, foc_product_unit_id: unit.id } : line;
        }));
    };

    const changeCartFocQuantity = (id, quantity, normalize = false) => {
        if (!can.discount) return;
        const parsedQuantity = Number(quantity);
        const nextQuantity = quantity === '' && !normalize
            ? ''
            : Math.max(0, Number.isFinite(parsedQuantity) ? parsedQuantity : 0);
        setCart((prev) => prev.map((line) => line.id === id ? { ...line, foc_quantity: nextQuantity } : line));
    };


    const removeCartLine = (id) => {
        setCart((items) => items.filter((item) => item.id !== id));
    };

    const changeSalePriceType = (next) => {
        if (!next || next === salePriceType) return;
        setSalePriceType(next);
        setCart((prev) => prev.map((line) => {
            const sellingPrice = resolveSellingPrice(line.prices, next);
            return { ...line, price_type: sellingPrice.price_type, unit_price: sellingPrice.price, use_flash_sale: false };
        }));
    };

    const totals = useMemo(() => {
        const subtotal = cart.reduce((sum, item) => sum + calculateLineTotal(item), 0);
        const discountRaw = discountType === 'percent'
            ? subtotal * (Number(discountValue || 0) / 100)
            : Number(discountValue || 0);
        const discount = Math.min(Math.max(discountRaw, 0), subtotal);
        const grandTotal = Math.max(0, subtotal - discount);

        return { subtotal, discount, grandTotal };
    }, [cart, discountType, discountValue]);
    const splitCash = Math.max(0, Number(splitAmounts.cash || 0));
    const splitMmqr = Math.max(0, Number(splitAmounts.mmqr || 0));
    const splitCredit = Math.max(0, Number(splitAmounts.credit || 0));
    const splitTotal = splitCash + splitMmqr + splitCredit;
    const splitRemaining = totals.grandTotal - splitTotal;
    const creditDeposit = tenderType === 'credit' ? Math.max(0, Number(amountTendered || 0)) : 0;
    const creditAmount = tenderType === 'credit' ? Math.max(0, totals.grandTotal - creditDeposit) : tenderType === 'split' ? splitCredit : 0;
    const usesCredit = creditAmount > 0;
    const creditUnavailable = usesCredit && (
        !selectedCustomer
        || selectedCustomer.is_walk_in
        || selectedCustomer.credit_status !== 'active'
        || creditAmount <= 0
        || creditAmount > Number(selectedCustomer.available_credit || 0) + 0.009
    );
    const paymentInvalid = (tenderType === 'cash' && Number(amountTendered || 0) < totals.grandTotal)
        || (tenderType === 'split' && (Math.abs(splitRemaining) > 0.009 || [splitCash, splitMmqr, splitCredit].filter((amount) => amount > 0).length < 2))
        || creditUnavailable;
    const quickCashAmounts = useMemo(() => {
        const total = Math.ceil(Number(totals.grandTotal || 0));
        const denominations = [1000, 5000, 10000, 20000, 50000, 100000];
        return [...new Set([total, ...denominations.map((denomination) => Math.ceil(total / denomination) * denomination)])]
            .filter((amount) => amount >= total).sort((a, b) => a - b).slice(0, 4);
    }, [totals.grandTotal]);

    const hasStockIssue = useMemo(() => {
        const usageByProduct = new Map();
        cart.forEach((line) => {
            const key = line.product_id || line.product_code;
            const current = usageByProduct.get(key) || { used: 0, available: Number(line.available_base_qty || 0) };
            current.used += calculateLineBaseUsage(line);
            current.available = Math.max(current.available, Number(line.available_base_qty || 0));
            usageByProduct.set(key, current);
        });

        return [...usageByProduct.values()].some((stock) => stock.used > stock.available + 0.00005);
    }, [cart]);
    const hasAlternatePriceItems = useMemo(() => cart.some((line) => line.price_type !== 'retail'), [cart]);
    const focLineCount = useMemo(() => cart.filter((line) => Number(line.foc_quantity || 0) > 0).length, [cart]);
    const availablePriceTypes = useMemo(() => [...new Set(['retail', ...priceTypes, ...searchResults.flatMap((product) => (product.prices || []).map((price) => price.price_type)), ...cart.flatMap((line) => (line.prices || []).map((price) => price.price_type))])], [cart, priceTypes, searchResults]);
    const resultHeading = resultMeta.mode === 'popular' && !searchQuery.trim() ? tp('POPULAR PRODUCTS') : tp('RESULTS');
    const virtualRowCount = searchResults.length;
    const virtualStartRow = Math.max(0, Math.floor(productScrollTop / POS_TABLE_ROW_HEIGHT) - POS_RESULT_OVERSCAN_ROWS);
    const virtualEndRow = Math.min(
        virtualRowCount,
        Math.ceil((productScrollTop + productViewportHeight) / POS_TABLE_ROW_HEIGHT) + POS_RESULT_OVERSCAN_ROWS,
    );
    const virtualTopSpacer = virtualStartRow * POS_TABLE_ROW_HEIGHT;
    const virtualBottomSpacer = Math.max(0, (virtualRowCount - virtualEndRow) * POS_TABLE_ROW_HEIGHT);
    const visibleTableProducts = searchResults.slice(virtualStartRow, virtualEndRow);

    const scrollCategories = (direction) => {
        categoryScrollRef.current?.scrollBy({
            left: direction * 260,
            behavior: 'smooth',
        });
    };

    const openPaymentDialog = async () => {
        if (busy) return;
        if (!locationId) {
            setScanError(tp('Select a warehouse before selling.'));
            if (isMobile) setMobileStep('products');
            return;
        }
        if (hasStockIssue) {
            setScanError(tp('Cart quantity exceeds available warehouse stock.'));
            if (isMobile) setMobileStep('cart');
            return;
        }
        if (cart.length) {
            setBusy(true);
            let updated;
            try {
                const latest = await api('/admin/pos/products/prices', { method: 'get', params: { unit_ids: cart.map(line => line.product_unit_id) } });
                updated = cart.map(line => {
                    const unit = latest.find(unit => Number(unit.id) === Number(line.product_unit_id));
                    const sellingPrice = resolveCartPrice(unit?.prices, salePriceType, unit?.flash_sale, line.use_flash_sale);
                    return {
                        ...line,
                        prices: unit?.prices || [],
                        flash_sale: unit?.flash_sale || null,
                        price_type: sellingPrice.price_type,
                        unit_price: sellingPrice.price,
                        use_flash_sale: sellingPrice.use_flash_sale,
                    };
                });
                setCart(updated);
                if (updated.some(line => line.unit_price <= 0)) { setScanError('A cart item is unavailable or needs a selling price. Review the cart.'); return; }
                const subtotal = updated.reduce((sum, item) => sum + calculateLineTotal(item), 0);
                const discount = Math.min(subtotal, Math.max(0, discountType === 'percent' ? subtotal * Number(discountValue || 0) / 100 : Number(discountValue || 0)));
                const finalTotal = subtotal - discount;
                setAmountTendered(String(finalTotal));
                setSplitAmounts({ cash: String(Math.floor(finalTotal / 2)), mmqr: String(finalTotal - Math.floor(finalTotal / 2)), credit: '' });
            } catch { return; }
            finally { setBusy(false); }
            if (isMobile) {
                setMobileStep('checkout');
            } else {
                setPaymentDialogOpen(true);
            }
        }
    };

    const checkout = async (event) => {
        event.preventDefault();
        if (!locationId || !cart.length || checkoutSubmittingRef.current) return;
        if (!selectedCustomer && usesCredit) {
            setScanError(tp('Choose a registered customer before completing the sale.'));
            return;
        }

        checkoutSubmittingRef.current = true;
        setBusy(true);
        try {
            const data = await api(editOrder ? `/admin/orders/${editOrder.id}/revise-pos-sale` : '/admin/pos/checkout', {
                method: 'post',
                data: {
                    location_id: locationId,
                    customer_id: selectedCustomer?.is_walk_in ? null : selectedCustomer?.id,
                    customer_name: selectedCustomer?.is_walk_in ? WALK_IN_CUSTOMER.name : selectedCustomer?.name,
                    customer_phone: selectedCustomer?.is_walk_in ? null : (selectedCustomer?.phone || null),
                    items: cart.map((item) => ({
                        product_unit_id: item.product_unit_id,
                        quantity: item.quantity,
                        price_type: item.price_type,
                        expected_unit_price: item.unit_price,
                        use_flash_sale: false,
                        foc_quantity: Number(item.foc_quantity || 0),
                        foc_product_unit_id: Number(item.foc_quantity || 0) > 0 ? item.foc_product_unit_id : null,
                    })),
                    discount_type: discountType || null,
                    discount_value: discountValue || 0,
                    tender_type: tenderType === 'split' ? null : tenderType,
                    amount_tendered: tenderType === 'split' ? null : (['cash', 'credit'].includes(tenderType) ? Number(amountTendered || 0) : totals.grandTotal),
                    tenders: tenderType === 'split' ? [
                        splitCash > 0 ? { type: 'cash', amount: splitCash, amount_tendered: splitCash } : null,
                        splitMmqr > 0 ? { type: 'mmqr', amount: splitMmqr, reference: paymentReference.trim() || null } : null,
                        splitCredit > 0 ? { type: 'credit', amount: splitCredit } : null,
                    ].filter(Boolean) : null,
                    credit_deposit_method: tenderType === 'credit' ? creditDepositMethod : null,
                    payment_details: paymentReference.trim() && (tenderType === 'mmqr' || (tenderType === 'credit' && creditDepositMethod === 'mmqr'))
                        ? { reference: paymentReference.trim() }
                        : null,
                    notes: saleNote.trim() || null,
                },
            });
            if ((checkoutIntentRef.current === 'print' || app_settings.receipt?.auto_print) && data.receipt_url) {
                const separator = data.receipt_url.includes('?') ? '&' : '?';
                window.location.assign(`${data.receipt_url}${separator}print=1`);
                return;
            }
            setReceipt(data);
            setCart([]);
            setDiscountType('');
            setDiscountValue('');
            setSplitAmounts({ cash: '', mmqr: '', credit: '' });
            setSelectedCustomer(WALK_IN_CUSTOMER);
            setCustomerSearchInput('');
            setPaymentReference('');
            setSaleNote('');
            setPaymentDialogOpen(false);
            setMobileStep('products');
            setMessage(`${tp(editOrder ? 'POS sale updated' : 'Sale completed')}: ${data.order.receipt_number}`);
            window.setTimeout(() => searchInputRef.current?.focus(), 100);
        } finally {
            checkoutIntentRef.current = 'complete';
            checkoutSubmittingRef.current = false;
            setBusy(false);
        }
    };

    const paymentFormContent = (
        <Stack spacing={1.25} className="pos-console__payment-form">
            <Box className="pos-console__customer-selector">
                <Stack className="pos-console__customer-row" direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
                    <Autocomplete
                        size="small"
                        fullWidth
                        options={customerOptions}
                        value={selectedCustomer}
                        onChange={(event, value) => {
                            const nextCustomer = value || WALK_IN_CUSTOMER;
                            setSelectedCustomer(nextCustomer);
                        }}
                        onInputChange={(event, value) => setCustomerSearchInput(value || '')}
                        getOptionLabel={(option) => option?.is_walk_in ? tp('Walk-in customer') : (option?.name || '')}
                        renderOption={(props, option) => (
                            <li {...props} key={option.is_walk_in ? 'walk-in' : (option.id || option.email || option.name)}>
                                <Stack>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{option.is_walk_in ? tp('Walk-in customer') : option.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {option.is_walk_in ? tp('Default customer for counter sales') : ([option.phone, option.email].filter(Boolean).join(' / ') || tp('No contact'))}
                                    </Typography>
                                    {!option.is_walk_in && option.credit_status === 'active' && (
                                        <Typography variant="caption" color="primary.main">
                                            {tp('Available credit')}: {money(option.available_credit)}
                                        </Typography>
                                    )}
                                </Stack>
                            </li>
                        )}
                        loading={customerLoading}
                        isOptionEqualToValue={(option, value) => option?.is_walk_in
                            ? Boolean(value?.is_walk_in)
                            : Number(option?.id) === Number(value?.id)}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label={tp('Customer')}
                                placeholder={tp('Search customer by name, phone, or email...')}
                                size="small"
                            />
                        )}
                        sx={{ flex: 1, minWidth: 0 }}
                    />
                    <Button className="pos-console__new-customer" size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => {
                        setCustomerCreateErrors({});
                        setNewCustomer({ name: '', email: customerSearchInput.includes('@') ? customerSearchInput : '', phone: '' });
                        setCustomerDialogOpen(true);
                    }}>{tp('New customer')}</Button>
                </Stack>
                {selectedCustomer?.is_walk_in && (
                    <Typography className="pos-console__walk-in-hint" variant="caption" color="text.secondary">
                        {tp('Walk-in sale; no customer account is needed.')}
                    </Typography>
                )}
            </Box>

            {can.discount && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                        select
                        size="small"
                        label={tp('Discount')}
                        value={discountType}
                        onChange={(event) => setDiscountType(event.target.value)}
                        sx={{ flex: 1 }}
                    >
                        <MenuItem value="">{tp('No discount')}</MenuItem>
                        <MenuItem value="amount">{tp('Amount')}</MenuItem>
                        <MenuItem value="percent">{tp('Percent')}</MenuItem>
                    </TextField>
                    <TextField
                        size="small"
                        type="number"
                        label={tp('Value')}
                        value={discountValue}
                        disabled={!discountType}
                        onChange={(event) => setDiscountValue(event.target.value)}
                        slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                        sx={{ flex: 1 }}
                    />
                </Stack>
            )}



            <Box className="pos-console__totals" sx={{ p: 1.5, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                <Stack spacing={0.85}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">{tp('Subtotal')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, textAlign: 'right' }}>{money(totals.subtotal)}</Typography>
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">{tp('Discount')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: totals.discount > 0 ? 'success.main' : 'inherit', textAlign: 'right' }}>-{money(totals.discount)}</Typography>
                    </Box>
                    <Divider />
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{tp('Sale total')}</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', textAlign: 'right' }}>{money(totals.grandTotal)}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                        {tp('Stock will be deducted from')} {location?.name || tp('selected warehouse')}.
                    </Typography>
                </Stack>
            </Box>

            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{tp('Payment Method')}</Typography>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    fullWidth
                    value={tenderType}
                    onChange={(event, next) => {
                        if (!next) return;
                        setTenderType(next);
                        setAmountTendered(next === 'credit' ? '0' : String(totals.grandTotal));
                        if (next === 'split') {
                            const half = Math.floor(totals.grandTotal / 2);
                            setSplitAmounts({ cash: String(half), mmqr: String(totals.grandTotal - half), credit: '' });
                        }
                        setPaymentReference('');
                    }}
                >
                    {paymentMethods.map((method) => (
                        <ToggleButton key={method} value={method} sx={{ flex: 1, textTransform: 'none' }}>{uiText(method === 'mmqr' ? 'MMQR (Pay)' : tp(method === 'split' ? 'Split' : method))}</ToggleButton>
                    ))}
                </ToggleButtonGroup>
            </Box>
            {tenderType === 'cash' && (
                <Stack spacing={0.75}>
                    <TextField size="small" type="number" label={tp('Cash received')} value={amountTendered}
                        onChange={(event) => setAmountTendered(event.target.value)} error={Number(amountTendered || 0) < totals.grandTotal}
                        helperText={uiText(Number(amountTendered || 0) < totals.grandTotal ? tp('Cash received must cover the sale total.') : `${tp('Change')}: ${money(Math.max(0, Number(amountTendered || 0) - totals.grandTotal))}`)}
                        inputProps={{ min: totals.grandTotal, step: 100 }} fullWidth />
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                        {quickCashAmounts.map((amount) => (
                            <Chip key={amount} clickable color={Number(amountTendered) === amount ? 'primary' : 'default'}
                                variant={Number(amountTendered) === amount ? 'filled' : 'outlined'}
                                label={uiText(amount === Math.ceil(totals.grandTotal) ? tp('Exact') : money(amount))}
                                onClick={() => setAmountTendered(String(amount))} />
                        ))}
                    </Stack>
                </Stack>
            )}
            {tenderType === 'mmqr' && (
                <TextField size="small" label={tp('Transaction reference')} value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)} inputProps={{ maxLength: 100 }}
                    helperText={tp('Optional payment reference for reconciliation.')} fullWidth />
            )}
            {tenderType === 'credit' && (
                <Stack spacing={1}>
                    {(!selectedCustomer || selectedCustomer.is_walk_in) && <Alert severity="warning">{tp('Choose a registered customer for a credit sale.')}</Alert>}
                    {selectedCustomer && !selectedCustomer.is_walk_in && selectedCustomer.credit_status !== 'active' && (
                        <Alert severity="error">{tp('Credit sales are not enabled for this customer.')}</Alert>
                    )}
                    {selectedCustomer?.credit_status === 'active' && (
                        <Alert severity={creditAmount <= Number(selectedCustomer.available_credit || 0) ? 'info' : 'error'}>
                            {tp('Available credit')}: {money(selectedCustomer.available_credit)} · {tp('Due in')} {selectedCustomer.credit_terms_days} {tp('days')}
                        </Alert>
                    )}
                    <TextField
                        size="small"
                        type="number"
                        label={tp('Deposit paid now')}
                        value={amountTendered}
                        onChange={(event) => setAmountTendered(event.target.value)}
                        error={creditDeposit >= totals.grandTotal || creditDeposit < 0}
                        helperText={`${tp('Credit balance')}: ${money(creditAmount)}`}
                        inputProps={{ min: 0, max: Math.max(0, totals.grandTotal - 0.01), step: 100 }}
                        fullWidth
                    />
                    {creditDeposit > 0 && (
                        <TextField select size="small" label={tp('Deposit method')} value={creditDepositMethod} onChange={(event) => {
                            setCreditDepositMethod(event.target.value);
                            setPaymentReference('');
                        }} fullWidth>
                            <MenuItem value="cash">{tp('cash')}</MenuItem>
                            <MenuItem value="mmqr">{uiText("MMQR (Pay)")}</MenuItem>
                        </TextField>
                    )}
                    {creditDeposit > 0 && creditDepositMethod === 'mmqr' && (
                        <TextField size="small" label={tp('Transaction reference')} value={paymentReference}
                            onChange={(event) => setPaymentReference(event.target.value)} inputProps={{ maxLength: 100 }} fullWidth />
                    )}
                </Stack>
            )}
            {tenderType === 'split' && (
                <Stack spacing={1}>
                    <Alert severity={Math.abs(splitRemaining) <= 0.009 ? 'success' : splitRemaining > 0 ? 'info' : 'error'}>
                        {Math.abs(splitRemaining) <= 0.009
                            ? tp('Payment total matches the sale total.')
                            : `${tp(splitRemaining > 0 ? 'Remaining' : 'Over allocated')}: ${money(Math.abs(splitRemaining))}`}
                    </Alert>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
                        <TextField size="small" type="number" label={tp('Cash amount')} value={splitAmounts.cash}
                            onChange={(event) => setSplitAmounts((current) => ({ ...current, cash: event.target.value }))}
                            inputProps={{ min: 0, step: 100 }} fullWidth />
                        <TextField size="small" type="number" label={uiText("MMQR (Pay)")} value={splitAmounts.mmqr}
                            onChange={(event) => setSplitAmounts((current) => ({ ...current, mmqr: event.target.value }))}
                            inputProps={{ min: 0, step: 100 }} fullWidth />
                        {can.credit && <TextField size="small" type="number" label={tp('Credit amount')} value={splitAmounts.credit}
                            onChange={(event) => setSplitAmounts((current) => ({ ...current, credit: event.target.value }))}
                            inputProps={{ min: 0, step: 100 }} fullWidth />}
                    </Box>
                    {splitMmqr > 0 && <TextField size="small" label={tp('MMQR transaction reference')} value={paymentReference}
                        onChange={(event) => setPaymentReference(event.target.value)} inputProps={{ maxLength: 100 }} fullWidth />}
                    {splitCredit > 0 && (!selectedCustomer || selectedCustomer.is_walk_in) && <Alert severity="warning">{tp('Choose a registered customer for a credit sale.')}</Alert>}
                    {splitCredit > 0 && selectedCustomer && !selectedCustomer.is_walk_in && (
                        <Alert severity={!creditUnavailable ? 'info' : 'error'}>
                            {tp('Credit balance')}: {money(splitCredit)} · {tp('Available credit')}: {money(selectedCustomer.available_credit || 0)}
                        </Alert>
                    )}
                </Stack>
            )}
            <TextField size="small" label={tp('Sale note (optional)')} value={saleNote}
                onChange={(event) => setSaleNote(event.target.value)} inputProps={{ maxLength: 500 }} multiline minRows={2} fullWidth />
        </Stack>
    );

    const completeSaleButtons = (
        <>
            <Button
                type="submit"
                variant="outlined"
                startIcon={<PrintIcon />}
                disabled={busy || cart.length === 0 || !locationId || hasStockIssue || paymentInvalid}
                onClick={() => {
                    checkoutIntentRef.current = 'print';
                }}
                sx={{
                    width: { xs: '100%', sm: 'auto' },
                    minWidth: 0,
                    minHeight: { xs: 48, sm: 36 },
                    px: { xs: 1, sm: 2 },
                    whiteSpace: 'normal',
                    lineHeight: 1.2,
                    '& .MuiButton-startIcon': { display: { xs: 'none', sm: 'inherit' } },
                }}
            >
                {tp(editOrder ? 'Update & Print' : 'Complete & Print')}
            </Button>
            <Button
                type="submit"
                variant="contained"
                startIcon={<CheckoutIcon />}
                disabled={busy || cart.length === 0 || !locationId || hasStockIssue || paymentInvalid}
                onClick={() => {
                    checkoutIntentRef.current = 'complete';
                }}
                sx={{
                    width: { xs: '100%', sm: 'auto' },
                    minWidth: 0,
                    minHeight: { xs: 48, sm: 36 },
                    px: { xs: 1, sm: 2 },
                    whiteSpace: 'normal',
                    lineHeight: 1.2,
                    '& .MuiButton-startIcon': { display: { xs: 'none', sm: 'inherit' } },
                }}
            >
                {tp(editOrder ? 'Update Sale' : 'Complete Sale')}
            </Button>
        </>
    );

    const visiblePageErrors = Object.entries({ ...pageErrors, ...errors });

    return (
        <Box
            className="app-root pos-console"
            style={{
                '--color-primary': theme.palette.primary.main,
                '--color-primary-dark': theme.palette.primary.dark,
                '--color-primary-soft': alpha(theme.palette.primary.main, 0.11),
                '--pos-primary': theme.palette.primary.main,
                '--pos-primary-strong': theme.palette.primary.dark,
                '--pos-primary-soft': alpha(theme.palette.primary.main, 0.11),
                '--pos-bg': alpha(theme.palette.primary.main, 0.055),
            }}
            sx={{
                minHeight: '100vh',
                background: (theme) => `
                    radial-gradient(circle at 12% 0%, ${alpha(theme.palette.primary.main, 0.16)} 0, transparent 28%),
                    linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.9)} 0%, ${alpha(theme.palette.primary.main, 0.07)} 48%, ${theme.palette.background.paper} 100%)
                `,
                display: 'flex',
                flexDirection: 'column',
                overflow: { xs: 'auto', md: 'hidden' },
            }}
        >
            <Head title={tp('POS')} />

            <Box
                component="header"
                className={`admin-topbar glass pos-console__titlebar ${mobileAppBarExpanded ? 'is-mobile-expanded' : 'is-mobile-collapsed'}`}
                sx={{
                    minHeight: 52,
                    px: { xs: 1.5, md: 2 },
                    py: 0.75,
                    bgcolor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    flexWrap: 'wrap',
                    flexShrink: 0,
                }}
            >
                <Button
                    className="pos-console__back-link"
                    size="small"
                    variant="text"
                    component={Link}
                    href={routeWithBase(admin_landing_path && admin_landing_path !== '/admin/pos' ? admin_landing_path : '/admin/dashboard', app_base)}
                    startIcon={<ArrowBackIcon fontSize="small" />}
                    aria-label={tp('Back')}
                >
                    <span className="pos-console__back-label">{tp('Back')}</span>
                </Button>
                <Stack className="pos-console__brand" direction="row" spacing={1} sx={{ minWidth: 0, alignItems: 'center' }}>
                    <CheckoutIcon color="primary" fontSize="small" />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                            {tp('POS Interface')}
                        </Typography>
                    </Box>
                </Stack>
                <Typography className="pos-console__mobile-location-summary" variant="caption" title={location?.name || tp('Warehouse')} noWrap>
                    {location?.name || tp('Warehouse')}
                </Typography>
                <Stack direction="row" spacing={0.75} className="pos-console__location" sx={{ alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        {tp('Warehouse')}
                    </Typography>
                    <TextField
                        select
                        size="small"
                        value={locationId}
                        onChange={(event) => setLocationId(event.target.value)}
                        inputProps={{ 'aria-label': tp('Warehouse') }}
                        sx={{ width: { xs: '100%', sm: 190 }, maxWidth: '100%' }}
                    >
                        {locations.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
                    </TextField>
                </Stack>
                <Box className="pos-console__titlebar-spacer" sx={{ flex: 1 }} />


                <Chip className="pos-console__online-status" size="small" color={isOnline ? 'success' : 'error'} label={uiText(isOnline ? tp('Online') : tp('Offline'))} variant="outlined" />
                <LanguageSwitcher compact className="pos-locale-switch" />
                {(auth?.user?.permissions || []).includes('dashboard.view') && (
                    <Button className="pos-console__dashboard-link" size="small" variant="text" component={Link} href={routeWithBase('/admin/dashboard', app_base)}>
                        {t('admin.items.dashboard', 'Dashboard')}
                    </Button>
                )}
                {!(auth?.user?.permissions || []).includes('dashboard.view') && admin_landing_path && admin_landing_path !== '/admin/pos' && (
                    <Button className="pos-console__dashboard-link" size="small" variant="text" component={Link} href={routeWithBase(admin_landing_path, app_base)}>
                        {t('Admin home')}
                    </Button>
                )}
                <Box className="pos-console__account-actions" sx={{ display: 'flex', gap: 0.5 }}>
                    <Button size="small" variant="text" component={Link} href={routeWithBase('/admin/settings?section=profile', app_base)}>
                        {t('Profile settings')}
                    </Button>
                    <Button size="small" variant="text" disabled={logoutForm.processing} onClick={() => logoutForm.post(routeWithBase('/admin/logout', app_base))}>
                        {t('Log out')}
                    </Button>
                </Box>
                <IconButton
                    className="pos-console__appbar-toggle"
                    size="small"
                    aria-label={uiText(mobileAppBarExpanded ? tp('Collapse app bar') : tp('Expand app bar'))}
                    aria-expanded={mobileAppBarExpanded}
                    onClick={() => setMobileAppBarExpanded((expanded) => !expanded)}
                >
                    {mobileAppBarExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
            </Box>

            <Box
                component="main"
                className="pos-console__body"
                sx={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    p: { xs: 1, md: 1.25 },
                    overflow: { xs: 'visible', md: 'hidden' },
                    '& .MuiPaper-root': { borderRadius: 1, boxShadow: 'none' },
                }}
            >
                {flash?.success || flash?.error || message || visiblePageErrors.length > 0 ? (
                    <Stack className="pos-console__notices" spacing={0.5}>

                        {flash?.success && <Alert severity="success">{tp(flash.success)}</Alert>}
                        {flash?.error && <Alert severity="error">{tp(flash.error)}</Alert>}
                        {message && <Alert severity="success" onClose={() => setMessage('')}>{tp(message)}</Alert>}
                        {visiblePageErrors.map(([key, value]) => (
                            <Alert severity="error" key={key}>
                                {tp(Array.isArray(value) ? value.join(' ') : value)}
                            </Alert>
                        ))}
                    </Stack>
                ) : null}

                <Paper
                    className="pos-console__mobile-tabs"
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        mb: 1,
                        p: 0.75,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                    }}
                >
                    <ToggleButtonGroup
                        fullWidth
                        exclusive
                        size="small"
                        value={mobileStep}
                        onChange={(event, next) => next && setMobileStep(next)}
                    >
                        <ToggleButton value="products" sx={{ textTransform: 'none', fontWeight: 800 }}>
                            {tp('Products')}
                        </ToggleButton>
                        <ToggleButton value="cart" sx={{ textTransform: 'none', fontWeight: 800 }}>
                            {tp('Cart')} ({cart.length})
                        </ToggleButton>
                        <ToggleButton value="checkout" disabled={cart.length === 0} sx={{ textTransform: 'none', fontWeight: 800 }}>
                            {tp('Checkout')}
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Paper>

                <Box
                    className="pos-console__workspace"
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 0.8fr) minmax(0, 1.2fr)' },
                        gap: 1.25,
                        alignItems: 'stretch',
                        flex: { xs: '0 0 auto', md: '1 1 auto' },
                        height: { xs: 'auto', md: 'auto' },
                        minHeight: 0,
                    }}
                >
                    <Paper className="pos-console__catalog" sx={{ p: { xs: 1.25, md: 1.35 }, width: '100%', height: { xs: 'auto', md: '100%' }, display: { xs: mobileStep === 'products' ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', borderTop: '2px solid', borderTopColor: 'primary.main' }}>
                        <Stack className="pos-console__catalog-header" direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                            <Stack className="pos-console__catalog-title" direction="row" spacing={1} sx={{ minWidth: 0, alignItems: 'center' }}>
                                <ScanIcon color="primary" fontSize="small" />
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                    {tp('Product Selection')}
                                </Typography>
                            </Stack>
                            <Box sx={{ flex: 1 }} />
                            <Stack className="pos-console__price-mode" direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                                <TextField
                                    select
                                    size="small"
                                    label={tp('Price type')}
                                    value={salePriceType}
                                    onChange={(event) => changeSalePriceType(event.target.value)}
                                >
                                    {availablePriceTypes.map((priceType) => <MenuItem key={priceType} value={priceType}>{tp(priceType.replaceAll('_', ' '))}</MenuItem>)}
                                </TextField>
                            </Stack>
                        </Stack>

                        {scanError && (
                            <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setScanError('')}>
                                {scanError}
                            </Alert>
                        )}

                        <Stack className="pos-console__catalog-search" direction="row" spacing={1}>
                            <TextField
                                fullWidth
                                size="small"
                                inputRef={searchInputRef}
                                placeholder={tp('Scan barcode or search product...')}
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        fetchSearch({ autoAddFirst: true, clearInputAfterSearch: true });
                                    }
                                }}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon fontSize="small" />
                                            </InputAdornment>
                                        ),
                                    },
                                    htmlInput: { enterKeyHint: 'search' },
                                }}
                            />
                            <Button variant="contained" size="small" onClick={() => fetchSearch()} disabled={searchLoading} sx={{ minWidth: 110 }}>
                                {tp('Search')}
                            </Button>
                        </Stack>

                        <Stack
                            className="pos-console__categories"
                            direction="row"
                            spacing={0.5}
                            sx={{
                                mt: 1.25,
                                mb: 0.35,
                                alignItems: 'center',
                            }}
                        >
                            <IconButton
                                size="small"
                                aria-label={tp('Scroll categories left')}
                                onClick={() => scrollCategories(-1)}
                                sx={{
                                    width: 26,
                                    height: 28,
                                    p: 0,
                                    flexShrink: 0,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    bgcolor: 'background.paper',
                                }}
                            >
                                <ChevronLeftIcon fontSize="small" />
                            </IconButton>
                            <Box
                                ref={categoryScrollRef}
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    px: 0.5,
                                    py: 0.25,
                                    overflowX: 'auto',
                                    overflowY: 'hidden',
                                    scrollbarWidth: 'none',
                                    msOverflowStyle: 'none',
                                    '&::-webkit-scrollbar': { display: 'none' },
                                }}
                            >
                                <RadioGroup
                                    row
                                    value={String(categoryId)}
                                    onChange={(event) => setCategoryId(event.target.value)}
                                    sx={{
                                        flexWrap: 'nowrap',
                                        gap: 0.85,
                                        minWidth: 'max-content',
                                        width: 'max-content',
                                        '& .MuiFormControlLabel-root': {
                                            mr: 0,
                                            ml: 0,
                                            px: 1,
                                            pr: 1.25,
                                            height: 28,
                                            minWidth: 'fit-content',
                                            flexShrink: 0,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            bgcolor: 'background.paper',
                                            borderRadius: 1,
                                        },
                                        '& .MuiFormControlLabel-root:has(.Mui-checked)': {
                                            borderColor: 'primary.main',
                                            bgcolor: 'rgba(10, 23, 91, 0.06)',
                                        },
                                        '& .MuiFormControlLabel-label': {
                                            fontSize: 13,
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                        },
                                        '& .MuiRadio-root': {
                                            p: 0.25,
                                            mr: 0.25,
                                        },
                                    }}
                                >
                                    <FormControlLabel value="" control={<Radio size="small" />} label={tp('All')} />
                                    {categories.map((item) => (
                                        <FormControlLabel key={item.id} value={String(item.id)} control={<Radio size="small" />} label={item.name} />
                                    ))}
                                </RadioGroup>
                            </Box>
                            <IconButton
                                size="small"
                                aria-label={tp('Scroll categories right')}
                                onClick={() => scrollCategories(1)}
                                sx={{
                                    width: 26,
                                    height: 28,
                                    p: 0,
                                    flexShrink: 0,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    bgcolor: 'background.paper',
                                }}
                            >
                                <ChevronRightIcon fontSize="small" />
                            </IconButton>
                        </Stack>

                        {cart.length > 0 && (
                            <Box className="pos-console__selected-strip" sx={{ display: { xs: 'block', md: 'none' }, mt: 0.75 }}>
                                <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 0.75, alignItems: 'center' }}>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                                        {tp('Selected products')}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main' }}>
                                        {cart.length} {uiText(cart.length === 1 ? tp('item') : tp('items'))}
                                    </Typography>
                                </Stack>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        gap: 1,
                                        overflowX: 'auto',
                                        overflowY: 'hidden',
                                        pb: 0.75,
                                        scrollbarWidth: 'none',
                                        msOverflowStyle: 'none',
                                        '&::-webkit-scrollbar': { display: 'none' },
                                    }}
                                >
                                    {cart.map((line) => {
                                        const lineTotal = calculateLineTotal(line);

                                        return (
                                            <Box
                                                className="pos-console__selected-card"
                                                key={line.id}
                                                sx={{
                                                    width: 176,
                                                    minWidth: 176,
                                                    display: 'grid',
                                                    gridTemplateColumns: '48px minmax(0, 1fr) 28px',
                                                    gap: 0.75,
                                                    alignItems: 'center',
                                                    p: 0.75,
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    bgcolor: 'background.paper',
                                                }}
                                            >
                                                <Box
                                                    className="pos-console__selected-image"
                                                    sx={{
                                                        width: 48,
                                                        height: 48,
                                                        display: 'grid',
                                                        placeItems: 'center',
                                                        bgcolor: 'action.hover',
                                                        overflow: 'hidden',
                                                        border: '1px solid',
                                                        borderColor: 'divider',
                                                    }}
                                                >
                                                    {line.image_path ? (
                                                        <Box component="img" src={storageUrl(line.image_path, app_url)} alt="" loading="lazy" decoding="async" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 800, textAlign: 'center', px: 0.25 }}>
                                                            {uiText(line.product_code || tp('No image'))}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Typography variant="caption" title={line.name} sx={{ display: 'block', fontWeight: 800, lineHeight: 1.12 }} noWrap>
                                                        {line.name}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                                                        x{line.quantity} - {money(lineTotal)}{uiText(Number(line.foc_quantity || 0) > 0 ? ` + ${tp('FOC')} ${line.foc_quantity}` : '')}
                                                    </Typography>
                                                </Box>
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    aria-label={`${tp('Remove item')} ${line.name}`}
                                                    onClick={() => removeCartLine(line.id)}
                                                    sx={{ width: 28, height: 28, alignSelf: 'start' }}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        );
                                    })}
                                </Box>
                            </Box>
                        )}

                        <Divider sx={{ my: 1.25 }} />

                        <Stack className="pos-console__results-meta" direction="row" justifyContent="space-between" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                                {resultHeading}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {uiText(searchLoading && searchResults.length === 0 ? tp('Loading...') : `${searchResults.length} ${tp('shown')}`)}
                            </Typography>
                        </Stack>

                        <TableContainer className="pos-console__product-table" ref={setProductResultsElement} sx={{ mt: 1, flex: 1, minHeight: 0, overflow: 'auto' }}>
                                <Table
                                    size="small"
                                    stickyHeader
                                    sx={{
                                        tableLayout: 'fixed',
                                        '& .MuiTableCell-root': { px: 0.75, py: 0.55 },
                                        '& .MuiTableCell-head': { py: 0.55, fontSize: 12 },
                                    }}
                                >
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: (theme) => theme.palette.mode === 'light' ? 'grey.50' : 'rgba(255,255,255,.05)' }}>
                                            <TableCell sx={{ fontWeight: 700 }}>{tp('Product')}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, width: 135 }} align="right">{tp('Price')}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, width: 72 }} align="right">{tp('Available')}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, width: 44 }} align="center">{tp('Add')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {virtualTopSpacer > 0 && (
                                            <TableRow aria-hidden="true">
                                                <TableCell colSpan={4} sx={{ p: 0, height: virtualTopSpacer, border: 0 }} />
                                            </TableRow>
                                        )}
                                        {visibleTableProducts.map((product) => {
                                            const outOfStock = Number(product.available_qty || 0) <= 0;
                                            return (
                                                <TableRow key={product.id} hover sx={outOfStock ? { bgcolor: 'rgba(211, 47, 47, 0.08)' } : undefined}>
                                                    <TableCell>
                                                        <Stack className="pos-console__product-cell" direction="row" spacing={0.75}>
                                                            <Box className="pos-console__list-thumbnail">
                                                                {product.image_path ? (
                                                                    <Box
                                                                        component="img"
                                                                        src={storageUrl(product.image_path, app_url)}
                                                                        alt=""
                                                                        loading="lazy"
                                                                        decoding="async"
                                                                    />
                                                                ) : (
                                                                    <ImagePlaceholderIcon aria-hidden="true" />
                                                                )}
                                                            </Box>
                                                            <Box className="pos-console__product-copy">
                                                                <Typography variant="body2" noWrap title={getProductDisplayName(product)}>{getProductDisplayName(product)}</Typography>
                                                                <Typography variant="caption" color="text.secondary" noWrap>{product.product_code || '-'} · {product.unit_code || product.unit_name}</Typography>
                                                                <Typography className="pos-console__mobile-product-meta" variant="caption" color="text.secondary" noWrap>
                                                                    {money(resolveProductPrice(product))} · {formatSelectedUnitQuantity(product.available_qty, product, product.unit_options)} {tp('available')}
                                                                </Typography>
                                                            </Box>
                                                        </Stack>
                                                    </TableCell>
                                                    <TableCell className="pos-console__product-price" align="right">
                                                        <Typography variant="body2" noWrap>{money(resolveProductPrice(product))}</Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2" sx={{ fontWeight: 700, color: outOfStock ? 'error.main' : 'inherit' }}>{formatSelectedUnitQuantity(product.available_qty, product, product.unit_options)}</Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <IconButton size="small" color={outOfStock ? 'error' : 'primary'} disabled={outOfStock} onClick={() => addProductToCart(product)} sx={{ width: 30, height: 30 }}>
                                                            <AddIcon fontSize="small" />
                                                        </IconButton>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {virtualBottomSpacer > 0 && (
                                            <TableRow aria-hidden="true">
                                                <TableCell colSpan={4} sx={{ p: 0, height: virtualBottomSpacer, border: 0 }} />
                                            </TableRow>
                                        )}
                                        {resultMeta.has_more && (
                                            <TableRow ref={productLoadMoreSentinelRef} className="pos-console__load-sentinel" aria-hidden="true">
                                                <TableCell colSpan={4} sx={{ p: 0, height: 1, border: 0 }} />
                                            </TableRow>
                                        )}
                                        {searchResults.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} align="center" sx={{ py: 2 }}>
                                                    <Typography variant="body2" color="text.secondary">{tp('Search products or scan a barcode to add items.')}</Typography>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                        </TableContainer>

                        {searchLoading && searchResults.length > 0 && (
                            <Stack
                                className="pos-console__infinite-status"
                                direction="row"
                                spacing={0.75}
                                role="status"
                                aria-live="polite"
                            >
                                <CircularProgress size={13} thickness={5} />
                                <Typography variant="caption">{tp('Loading products...')}</Typography>
                            </Stack>
                        )}

                    </Paper>

                    <Paper className="pos-console__cart" sx={{ p: { xs: 1.15, md: 1.25 }, width: '100%', height: { xs: 'auto', md: '100%' }, display: { xs: mobileStep === 'cart' ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', borderTop: '2px solid', borderTopColor: 'success.main' }}>
                        <Box className="pos-console__cart-header" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 1, width: '100%' }}>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{tp('Current Sale')}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {cart.length} {uiText(cart.length === 1 ? tp('item') : tp('items'))} {tp('from')} {location?.name || tp('warehouse')}
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} sx={{ justifySelf: 'end', flexShrink: 0, alignItems: 'center' }}>
                                {hasAlternatePriceItems && (
                                    <Chip size="small" color="warning" variant="outlined" label={tp('Alternate pricing')} />
                                )}
                                {focLineCount > 0 && (
                                    <Chip size="small" color="info" variant="outlined" icon={<FocIcon />} label={`${focLineCount} ${tp('FOC')}`} />
                                )}
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<CheckoutIcon />}
                                    disabled={busy || !isOnline || !locationId || cart.length === 0 || hasStockIssue}
                                    onClick={openPaymentDialog}
                                    sx={{ minWidth: 128, fontWeight: 800 }}
                                >
                                    {tp('Sell')} {money(totals.grandTotal)}
                                </Button>
                            </Stack>
                        </Box>

                        <Divider className="pos-console__cart-divider" sx={{ my: 1 }} />

                        <Typography className="pos-console__cart-label" variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{tp('Cart')}</Typography>

                        <div className="pos-items">
                            {cart.map(line => <PosCartItem key={line.id} line={line} money={money} t={tp}
                                exceedsStock={lineExceedsStock(line)} canFoc={can.discount}
                                onQuantity={quantity => updateCartLine(line.id, { quantity })}
                                onUnit={unit => changeCartUnit(line.id, unit)}
                                onFocQuantity={(quantity, normalize) => changeCartFocQuantity(line.id, quantity, normalize)}
                                onFocUnit={unit => changeCartFocUnit(line.id, unit)}
                                onRemove={() => removeCartLine(line.id)} />)}
                            {!cart.length && <div className="pos-console__cart-empty">{tp('Cart is empty.')}</div>}
                        </div>

                    </Paper>

                    <Paper
                        className="pos-console__checkout-mobile"
                        component="form"
                        onSubmit={checkout}
                        sx={{
                            p: 1.25,
                            width: '100%',
                            display: { xs: mobileStep === 'checkout' ? 'flex' : 'none', md: 'none' },
                            flexDirection: 'column',
                            gap: 1.25,
                            borderTop: '2px solid',
                            borderTopColor: 'warning.main',
                        }}
                    >
                        <Stack className="pos-console__checkout-header" direction="row" justifyContent="space-between" spacing={1} sx={{ alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{tp('Final Checkout')}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {cart.length} {uiText(cart.length === 1 ? tp('item') : tp('items'))} - {location?.name || tp('warehouse')}
                                </Typography>
                            </Box>
                            <Chip size="small" color="primary" label={money(totals.grandTotal)} />
                        </Stack>

                        {paymentFormContent}

                        <Stack className="pos-console__checkout-actions" spacing={1} sx={{ pt: 0.5, width: '100%', minWidth: 0 }}>
                            <Button
                                type="button"
                                variant="outlined"
                                fullWidth
                                onClick={() => setMobileStep('cart')}
                                disabled={busy}
                                sx={{ minHeight: 46, fontWeight: 800 }}
                            >
                                {tp('Back to Cart')}
                            </Button>
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                                    gap: 1,
                                    width: '100%',
                                    minWidth: 0,
                                    '& .MuiButton-root': {
                                        fontWeight: 800,
                                        overflow: 'hidden',
                                        textAlign: 'center',
                                    },
                                }}
                            >
                                {completeSaleButtons}
                            </Box>
                        </Stack>
                    </Paper>
                </Box>
            </Box>

            <Dialog
                open={paymentDialogOpen}
                onClose={() => !busy && setPaymentDialogOpen(false)}
                maxWidth={false}
                slotProps={{
                    paper: {
                        className: 'pos-console__payment-dialog pos-console__shift-dialog',
                        style: {
                            '--pos-primary': theme.palette.primary.main,
                            '--pos-primary-strong': theme.palette.primary.dark,
                            '--pos-primary-soft': alpha(theme.palette.primary.main, 0.11),
                            '--color-primary': theme.palette.primary.main,
                            '--color-primary-dark': theme.palette.primary.dark,
                            '--color-primary-soft': alpha(theme.palette.primary.main, 0.11),
                            '--color-surface': theme.palette.background.paper,
                            '--color-soft': theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.045) : theme.palette.grey[50],
                            '--color-border': theme.palette.divider,
                            '--color-text': theme.palette.text.primary,
                            '--color-muted': theme.palette.text.secondary,
                        },
                        sx: {
                            width: 'min(680px, calc(100vw - 24px))',
                            maxWidth: 680,
                            borderRadius: 1.5,
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
                            boxShadow: '0 18px 48px rgba(10, 19, 24, 0.20), 0 3px 10px rgba(10, 19, 24, 0.08)',
                            maxHeight: 'calc(100dvh - 24px)',
                            overflow: 'hidden',
                        },
                    },
                }}
            >
                <Box className="pos-console__payment-window" component="form" onSubmit={checkout}>
                    <DialogTitle
                        className="pos-console__payment-titlebar pos-console__shift-titlebar"
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 1.25,
                            minHeight: 44,
                            height: 44,
                            px: 1.25,
                            py: 0,
                            borderBottom: `1px solid ${theme.palette.divider}`,
                            bgcolor: 'background.paper',
                        }}
                    >
                        <Stack direction="row" spacing={1.25} sx={{ minWidth: 0 }}>
                            <Box className="pos-console__shift-title-icon">
                                <CheckoutIcon sx={{ fontSize: 16 }} />
                            </Box>
                            <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', minHeight: 28 }}>
                                <Typography component="h2" className="pos-console__shift-title">
                                    {tp(editOrder ? 'Edit POS Sale' : 'Complete Sale')}{editOrder ? ` — ${editOrder.order_number}` : ''}
                                </Typography>
                            </Box>
                        </Stack>
                        <IconButton size="small" sx={{ width: 28, height: 28 }} onClick={() => setPaymentDialogOpen(false)} disabled={busy}>
                            <CloseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent className="pos-console__payment-body pos-console__shift-body" sx={{ p: 1.25, bgcolor: 'grey.50', overflowY: 'auto' }}>
                        {editOrder && <Alert severity="warning" sx={{ mb: 1 }}>{tp('Saving will revise stock, payments, credit, and reports. The original sale remains in the audit history.')}</Alert>}
                        {paymentFormContent}
                    </DialogContent>
                    <DialogActions className="pos-console__payment-actions pos-console__shift-actions" sx={{ flexWrap: 'wrap', gap: 0.75, px: 1.25, py: 1, borderTop: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper' }}>
                        <Button type="button" variant="outlined" onClick={() => setPaymentDialogOpen(false)} disabled={busy}>{tp('Cancel')}</Button>
                        {completeSaleButtons}
                    </DialogActions>
                </Box>
            </Dialog>





            <Dialog open={Boolean(receipt)} onClose={() => setReceipt(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {tp('Sale complete')}
                    <IconButton size="small" onClick={() => setReceipt(null)}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={1}>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>{receipt?.order?.receipt_number}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {tp('Total')} {money(receipt?.order?.final_amount)}
                        </Typography>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    {receipt?.receipt_url && <Button variant="contained" component="a" href={receipt.receipt_url}>{tp('Open receipt')}</Button>}
                </DialogActions>
            </Dialog>
            <Dialog open={customerDialogOpen} onClose={() => !customerCreating && setCustomerDialogOpen(false)} maxWidth="xs" fullWidth>
                <Box component="form" onSubmit={createCustomer}>
                    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {tp('New customer')}
                        <IconButton size="small" onClick={() => setCustomerDialogOpen(false)} disabled={customerCreating}><CloseIcon /></IconButton>
                    </DialogTitle>
                    <DialogContent dividers>
                        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                            {customerCreateErrors.request && <Alert severity="error">{customerCreateErrors.request}</Alert>}
                            <TextField required autoFocus label={tp('Customer name')} value={newCustomer.name} onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))} error={Boolean(customerCreateErrors.name)} helperText={customerCreateErrors.name?.[0]} fullWidth />
                            <TextField required type="email" label={tp('Email address')} value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} error={Boolean(customerCreateErrors.email)} helperText={customerCreateErrors.email?.[0] || tp('Customer can use this email to activate or reset their password.')} fullWidth />
                            <TextField label={tp('Phone number (optional)')} value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} error={Boolean(customerCreateErrors.phone)} helperText={customerCreateErrors.phone?.[0]} fullWidth />
                            <Alert severity="info">{tp('Credit is disabled by default. An authorized admin can enable it from the customer account.')}</Alert>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button type="button" onClick={() => setCustomerDialogOpen(false)} disabled={customerCreating}>{tp('Cancel')}</Button>
                        <Button type="submit" variant="contained" disabled={customerCreating || !newCustomer.name.trim() || !newCustomer.email.trim()}>{uiText(customerCreating ? tp('Creating...') : tp('Create & select'))}</Button>
                    </DialogActions>
                </Box>
            </Dialog>
        </Box>
    );
}
import PosCartItem from '@/Components/Admin/PosCartItem';
