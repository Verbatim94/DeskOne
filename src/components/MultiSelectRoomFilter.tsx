import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

interface MultiSelectRoomFilterProps {
    options: { label: string; value: string }[]
    selected: string[]
    onChange: (values: string[]) => void
    placeholder?: string
}

export function MultiSelectRoomFilter({
    options,
    selected,
    onChange,
    placeholder = "Filter rooms...",
}: MultiSelectRoomFilterProps) {
    const [open, setOpen] = React.useState(false)

    const handleSelect = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((item) => item !== value))
        } else {
            onChange([...selected, value])
        }
    }

    const isAllSelected = options.length > 0 && selected.length === options.length;

    const toggleAll = () => {
        if (isAllSelected) {
            onChange([]);
        } else {
            onChange(options.map(o => o.value));
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[200px] justify-between h-9"
                >
                    <span className="truncate">
                        {selected.length === 0
                            ? placeholder
                            : `${selected.length} selected`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search rooms..." />
                    <CommandList>
                        <CommandEmpty>No room found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                onSelect={toggleAll}
                                className="font-medium border-b"
                            >
                                <div
                                    className={cn(
                                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                        isAllSelected
                                            ? "bg-primary text-primary-foreground"
                                            : "opacity-50 [&_svg]:invisible"
                                    )}
                                >
                                    <Check className={cn("h-3 w-3")} />
                                </div>
                                {isAllSelected ? "Deselect All" : "Select All"}
                            </CommandItem>
                        </CommandGroup>
                        <CommandGroup className="max-h-64 overflow-auto">
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label} // Search by label
                                    onSelect={() => handleSelect(option.value)}
                                >
                                    <div
                                        className={cn(
                                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                            selected.includes(option.value)
                                                ? "bg-primary text-primary-foreground"
                                                : "opacity-50 [&_svg]:invisible"
                                        )}
                                    >
                                        <Check className={cn("h-3 w-3")} />
                                    </div>
                                    <span>{option.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
