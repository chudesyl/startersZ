-- Fix function search path security warning
CREATE OR REPLACE FUNCTION public.update_delivery_booking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;